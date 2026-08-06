/**
 * Wraps the existing Express app (src/server.js) as a single Netlify
 * Function, so none of the route/business logic needed to change.
 *
 * Netlify redirects "/api/*" to "/.netlify/functions/api/:splat" (see
 * netlify.toml), which strips the "/api" prefix along the way. This file
 * puts it back before handing the request to Express, since all of the
 * app's routes are defined as "/api/..." (and stay that way for local
 * dev with `node src/server.js` too).
 */
const serverless = require("serverless-http");
const app = require("../../src/server");

// xlsx exports are binary - without this, serverless-http would pass the
// file through as a UTF-8 string and corrupt it. Anything else this app
// returns (JSON) stays untouched.
const serverlessHandler = serverless(app, {
  binary: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ],
});

exports.handler = async (event, context) => {
  const strippedPrefix = event.path.replace(/^\/\.netlify\/functions\/api/, "");
  const withApiPrefix = "/api" + (strippedPrefix.startsWith("/") ? strippedPrefix : "/" + strippedPrefix);
  return serverlessHandler({ ...event, path: withApiPrefix }, context);
};
