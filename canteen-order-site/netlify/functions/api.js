/**
 * Wraps the existing Express app (src/server.js) as a single Netlify
 * Function, so none of the route/business logic needed to change.
 *
 * Netlify's "/api/*" redirect (see netlify.toml) is a rewrite (status 200),
 * which means the function receives the ORIGINAL request path as-is (e.g.
 * "/api/brands"), not a rewritten "/.netlify/functions/..." path. Since
 * the app's routes are already defined as "/api/...", no path translation
 * is needed here at all - just hand the request straight to Express.
 */
const serverless = require("serverless-http");
const app = require("../../src/server");

// xlsx exports are binary - without this, serverless-http would pass the
// file through as a UTF-8 string and corrupt it. Anything else this app
// returns (JSON) stays untouched.
exports.handler = serverless(app, {
  binary: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ],
});
