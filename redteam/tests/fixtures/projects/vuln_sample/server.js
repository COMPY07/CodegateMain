const express = require("express");
const child_process = require("child_process");
const fs = require("fs");
const app = express();

app.get("/run", (req, res) => {
  const name = req.query.name;
  // command injection via shell
  child_process.exec("echo " + name, (err, out) => res.send(out));
});

app.get("/file", (req, res) => {
  const p = req.query.path;
  // path traversal: user-controlled path
  fs.readFile(p, "utf8", (err, data) => res.send(data));
});

app.get("/calc", (req, res) => {
  // dynamic code evaluation of untrusted input
  const result = eval(req.query.expr);
  res.send(String(result));
});

function healthy() {
  return true;
}
