import json
import os
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
DB_PATH = os.environ.get("DEADLOCK_DB_PATH", "/tmp/deadlock-simulator.sqlite3" if os.environ.get("VERCEL") else os.path.join(os.path.dirname(__file__), "simulator.sqlite3"))


def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init_db():
    with closing(connect()) as db:
        db.execute("CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)")
        db.execute("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, kind TEXT NOT NULL, message TEXT NOT NULL, details TEXT NOT NULL)")
        if not db.execute("SELECT 1 FROM state WHERE id=1").fetchone():
            db.execute("INSERT INTO state VALUES (1, ?)", (json.dumps(initial_state()),))
            db.commit()


def initial_state():
    return {
        "processes": [
            {"id": "P1", "name": "P1", "status": "waiting"},
            {"id": "P2", "name": "P2", "status": "waiting"},
            {"id": "P3", "name": "P3", "status": "running"},
        ],
        "resources": [
            {"id": "R1", "name": "R1", "total": 1, "available": 0},
            {"id": "R2", "name": "R2", "total": 1, "available": 0},
            {"id": "R3", "name": "R3", "total": 1, "available": 1},
        ],
        "allocations": {"P1": {"R1": 1}, "P2": {"R2": 1}, "P3": {}},
        "requests": {"P1": {"R2": 1}, "P2": {"R1": 1}, "P3": {}},
        "maximum": {"P1": {"R1": 1, "R2": 1, "R3": 0}, "P2": {"R1": 1, "R2": 1, "R3": 0}, "P3": {"R1": 0, "R2": 0, "R3": 1}},
    }


def load_state(db=None):
    own = db is None
    db = db or connect()
    row = db.execute("SELECT data FROM state WHERE id=1").fetchone()
    if own:
        db.close()
    return json.loads(row[0])


def save_state(state, event=None, db=None):
    own = db is None
    db = db or connect()
    db.execute("UPDATE state SET data=? WHERE id=1", (json.dumps(state),))
    if event:
        kind, message, details = event
        db.execute("INSERT INTO events(created_at,kind,message,details) VALUES(?,?,?,?)", (now(), kind, message, json.dumps(details)))
    db.commit()
    if own:
        db.close()


def log_event(kind, message, details=None):
    with closing(connect()) as db:
        db.execute("INSERT INTO events(created_at,kind,message,details) VALUES(?,?,?,?)", (now(), kind, message, json.dumps(details or {})))
        db.commit()


def error(message, status=400):
    return jsonify({"error": message}), status


def matrices(state):
    ps, rs = state["processes"], state["resources"]
    allocation = {p["id"]: {r["id"]: state["allocations"].get(p["id"], {}).get(r["id"], 0) for r in rs} for p in ps}
    request_ = {p["id"]: {r["id"]: state["requests"].get(p["id"], {}).get(r["id"], 0) for r in rs} for p in ps}
    return ps, rs, allocation, request_


def detect(state):
    ps, rs, allocation, request_ = matrices(state)
    work = {r["id"]: r["available"] for r in rs}
    finish = {p["id"]: not any(allocation[p["id"]].values()) for p in ps}
    sequence = []
    changed = True
    while changed:
        changed = False
        for p in ps:
            pid = p["id"]
            if not finish[pid] and all(request_[pid][rid] <= work[rid] for rid in work):
                for rid in work:
                    work[rid] += allocation[pid][rid]
                finish[pid] = True
                sequence.append(pid)
                changed = True
    deadlocked = [pid for pid, done in finish.items() if not done]
    return {"deadlocked": bool(deadlocked), "processes": deadlocked, "completionOrder": sequence, "work": work}


def bankers(state):
    ps, rs, allocation, _ = matrices(state)
    work = {r["id"]: r["available"] for r in rs}
    need = {p["id"]: {r["id"]: max(0, state["maximum"].get(p["id"], {}).get(r["id"], 0) - allocation[p["id"]][r["id"]]) for r in rs} for p in ps}
    finish = {p["id"]: False for p in ps}
    sequence = []
    while True:
        candidate = next((p["id"] for p in ps if not finish[p["id"]] and all(need[p["id"]][rid] <= work[rid] for rid in work)), None)
        if candidate is None:
            break
        finish[candidate] = True
        sequence.append(candidate)
        for rid in work:
            work[rid] += allocation[candidate][rid]
    return {"safe": all(finish.values()), "sequence": sequence if all(finish.values()) else [], "need": need, "remaining": [pid for pid, done in finish.items() if not done]}


def graph(state):
    processes, resources, allocation, request_ = matrices(state)
    nodes = ([{"id": p["id"], "type": "process", "label": p["name"], "status": p["status"]} for p in processes] +
             [{"id": r["id"], "type": "resource", "label": r["name"], "available": r["available"], "total": r["total"]} for r in resources])
    edges = []
    for p in processes:
        for r in resources:
            if allocation[p["id"]][r["id"]]:
                edges.append({"from": r["id"], "to": p["id"], "type": "allocation", "units": allocation[p["id"]][r["id"]]})
            if request_[p["id"]][r["id"]]:
                edges.append({"from": p["id"], "to": r["id"], "type": "request", "units": request_[p["id"]][r["id"]]})
    return {"nodes": nodes, "edges": edges}


init_db()


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/state")
def get_state():
    state = load_state()
    with closing(connect()) as db:
        events = [dict(row) | {"details": json.loads(row["details"])} for row in db.execute("SELECT * FROM events ORDER BY id DESC LIMIT 60")]
    return jsonify({"state": state, "graph": graph(state), "detection": detect(state), "bankers": bankers(state), "history": events})


@app.put("/api/state")
def replace_state():
    state = request.get_json(silent=True)
    if not isinstance(state, dict) or not all(k in state for k in ("processes", "resources", "allocations", "requests", "maximum")):
        return error("Provide processes, resources, allocations, requests, and maximum.")
    try:
        for r in state["resources"]:
            if int(r["total"]) < 1 or not 0 <= int(r["available"]) <= int(r["total"]):
                raise ValueError
        save_state(state, ("setup", "Simulation scenario updated", {}))
        return get_state()
    except (KeyError, TypeError, ValueError):
        return error("Scenario has invalid resource counts.")


@app.post("/api/processes")
def add_process():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip() or f"P{uuid.uuid4().hex[:4]}"
    state = load_state()
    if any(p["id"] == name for p in state["processes"]):
        return error("A process with that ID already exists.")
    state["processes"].append({"id": name, "name": name, "status": "running"})
    state["allocations"][name] = {}
    state["requests"][name] = {}
    state["maximum"][name] = {}
    for r in state["resources"]:
        state["allocations"][name][r["id"]] = 0
        state["requests"][name][r["id"]] = 0
        state["maximum"][name][r["id"]] = r["total"]
    save_state(state, ("process", f"Created process {name}", {"process": name}))
    return jsonify({"state": state}), 201


@app.post("/api/resources")
def add_resource():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip() or f"R{uuid.uuid4().hex[:4]}"
    try:
        total = int(payload.get("total", 1))
        if total < 1 or total > 99:
            raise ValueError
    except (TypeError, ValueError):
        return error("Resource instances must be between 1 and 99.")
    state = load_state()
    if any(r["id"] == name for r in state["resources"]):
        return error("A resource with that ID already exists.")
    state["resources"].append({"id": name, "name": name, "total": total, "available": total})
    for p in state["processes"]:
        for key in ("allocations", "requests", "maximum"):
            state[key].setdefault(p["id"], {})[name] = total if key == "maximum" else 0
    save_state(state, ("resource", f"Added {name} with {total} instance{'s' if total != 1 else ''}", {"resource": name, "total": total}))
    return jsonify({"state": state}), 201


@app.post("/api/allocate")
def allocate():
    return change_units("allocate")


@app.post("/api/request")
def request_units():
    return change_units("request")


@app.post("/api/release")
def release():
    return change_units("release")


def change_units(action):
    data = request.get_json(silent=True) or {}
    pid, rid = str(data.get("process", "")), str(data.get("resource", ""))
    try:
        units = int(data.get("units", 1))
        if units < 1: raise ValueError
    except (TypeError, ValueError):
        return error("Units must be a positive whole number.")
    state = load_state()
    process = next((p for p in state["processes"] if p["id"] == pid), None)
    resource = next((r for r in state["resources"] if r["id"] == rid), None)
    if not process or not resource:
        return error("Select an existing process and resource.")
    if process["status"] == "completed":
        return error("This process has already been terminated.")
    if units > resource["total"]:
        return error("Requested units cannot exceed the resource's total instances.")
    held = state["allocations"].setdefault(pid, {}).get(rid, 0)
    if action == "allocate":
        if resource["available"] < units: return error("Not enough instances are currently available.")
        resource["available"] -= units
        state["allocations"][pid][rid] = held + units
        process["status"] = "waiting" if any(state["requests"].get(pid, {}).values()) else "running"
    elif action == "request":
        state["requests"].setdefault(pid, {})[rid] = state["requests"].get(pid, {}).get(rid, 0) + units
        process["status"] = "waiting"
        if resource["available"] >= units:
            resource["available"] -= units
            state["allocations"][pid][rid] = held + units
            state["requests"][pid][rid] -= units
            process["status"] = "waiting" if any(state["requests"][pid].values()) else "running"
    else:
        if held < units: return error("The process does not hold that many instances.")
        state["allocations"][pid][rid] = held - units
        resource["available"] += units
        grant_waiting(state)
    save_state(state, (action, f"{pid} {action}d {units} {rid}", {"process": pid, "resource": rid, "units": units}))
    return get_state()


@app.post("/api/detect")
def detect_route():
    result = detect(load_state())
    log_event("detection", "Deadlock detected" if result["deadlocked"] else "No deadlock detected", result)
    return jsonify(result)


@app.post("/api/bankers")
def bankers_route():
    result = bankers(load_state())
    log_event("bankers", "Safe state found" if result["safe"] else "Unsafe state", result)
    return jsonify(result)


def release_process(state, pid):
    for resource in state["resources"]:
        rid = resource["id"]
        resource["available"] += state["allocations"].get(pid, {}).get(rid, 0)
        state["allocations"].setdefault(pid, {})[rid] = 0
        state["requests"].setdefault(pid, {})[rid] = 0
    process = next(p for p in state["processes"] if p["id"] == pid)
    process["status"] = "completed"
    grant_waiting(state)


def grant_waiting(state):
    """Grant pending resource requests that now fit in the available pool."""
    for process in state["processes"]:
        if process["status"] == "completed":
            continue
        pid = process["id"]
        pending = state["requests"].get(pid, {})
        for resource in state["resources"]:
            rid = resource["id"]
            units = pending.get(rid, 0)
            if units and resource["available"] >= units:
                resource["available"] -= units
                state["allocations"].setdefault(pid, {})[rid] = state["allocations"].get(pid, {}).get(rid, 0) + units
                pending[rid] = 0
        process["status"] = "waiting" if any(pending.values()) else "running"


def recovery_preview(state, strategy):
    result = detect(state)
    victims = result["processes"]
    if not victims: return {"strategy": strategy, "victims": [], "steps": [], "remainingDeadlock": [], "resolved": True, "releasedInstances": {}}
    if strategy == "victim": victims = [min(victims, key=lambda pid: sum(state["allocations"].get(pid, {}).values()))]
    elif strategy == "all": victims = list(victims)
    elif strategy == "stepwise": victims = list(victims)
    steps, released = [], {}
    for pid in victims:
        before = detect(state)["processes"]
        freed = {r["id"]: state["allocations"].get(pid, {}).get(r["id"], 0) for r in state["resources"]}
        release_process(state, pid)
        after = detect(state)["processes"]
        released[pid] = freed
        steps.append({"victim": pid, "released": freed, "deadlockedBefore": before, "deadlockedAfter": after, "resolved": not after})
        if strategy == "stepwise" and not after: break
    remaining = detect(state)["processes"]
    return {"strategy": strategy, "victims": [s["victim"] for s in steps], "steps": steps, "remainingDeadlock": remaining, "resolved": not remaining, "releasedInstances": released}


@app.get("/api/recovery/preview")
def recovery_preview_route():
    base = load_state()
    return jsonify({name: recovery_preview(json.loads(json.dumps(base)), name) for name in ("victim", "all", "stepwise")})


@app.post("/api/recovery")
def recover():
    data = request.get_json(silent=True) or {}
    strategy = data.get("strategy", "stepwise")
    if strategy not in ("victim", "all", "stepwise"): return error("Choose victim, all, or stepwise recovery.")
    state = load_state()
    result = recovery_preview(state, strategy)
    if not result["victims"]: return jsonify({"result": result, "state": state})
    save_state(state, ("recovery", f"{strategy.title()} recovery terminated {', '.join(result['victims'])}", result))
    return jsonify({"result": result, "state": state})


@app.delete("/api/history")
def clear_history():
    with closing(connect()) as db:
        db.execute("DELETE FROM events")
        db.commit()
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5000)), debug=True)
