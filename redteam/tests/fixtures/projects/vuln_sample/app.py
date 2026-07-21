import os
import sqlite3
import pickle
from flask import Flask, request

app = Flask(__name__)

API_KEY = "NOT_A_REAL_SECRET_FOR_TESTS"


@app.route("/ping")
def ping():
    host = request.args.get("host")
    # command injection: untrusted host flows into a shell
    os.system("ping -c 1 " + host)
    return "ok"


@app.route("/user")
def user():
    uid = request.args.get("id")
    conn = sqlite3.connect("app.db")
    # sql injection: string-built query
    conn.execute("SELECT * FROM users WHERE id = " + uid)
    return "ok"


@app.route("/load")
def load():
    blob = request.get_data()
    # unsafe deserialization
    return str(pickle.loads(blob))


def safe_add(a, b):
    return a + b
