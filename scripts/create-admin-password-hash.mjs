import { randomBytes, webcrypto } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { stdin, stdout } from "node:process";

const ITERATIONS = 310_000;
const encoder = new TextEncoder();

function readPassword() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Run this helper in an interactive terminal so the password is not echoed or piped.");
  }
  return new Promise((resolve, reject) => {
    let password = "";
    const decoder = new StringDecoder("utf8");
    const finish = (error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (chunk) => {
      for (const character of decoder.write(chunk)) {
        if (character === "\u0003" || character === "\u0004") {
          finish(new Error("Password entry cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") password = password.slice(0, -1);
        else password += character;
      }
    };
    stdout.write("New administrator password (minimum 12 characters; input hidden): ");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

try {
  const password = await readPassword();
  if (password.length < 12 || encoder.encode(password).length > 1024) {
    throw new Error("Password must be at least 12 characters and no more than 1024 bytes.");
  }
  const salt = randomBytes(16);
  const key = await webcrypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = new Uint8Array(await webcrypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt,
    iterations: ITERATIONS,
  }, key, 256));
  const base64url = (value) => Buffer.from(value).toString("base64url");
  console.log(`pbkdf2-sha256$${ITERATIONS}$${base64url(salt)}$${base64url(hash)}`);
} finally {
  readline.close();
}
