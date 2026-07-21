// Scan target.
// Intentional issues.

export const config = {
  apiKey: "sk_live_abcdef1234567890",
  cookie: { httpOnly: false },
};

export const awsKey = "AKIAIOSFODNN7EXAMPLE";

export function debug(password: string) {
  console.log("password is", password);
}
