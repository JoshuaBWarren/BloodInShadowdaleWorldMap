
// Blood in Shadowdale — Local DM Server
// GitHub Pages hosts the public map.
// This Node.js server runs only on your computer.

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

// HTTP RESPONSE

function respond(
  res,
  status,
  content,
  contentType = "text/plain; charset=utf-8"
) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });

  res.end(content);
}

// VALIDATE LOCATION DATA

function validate(payload) {
  if (
    !payload ||
    !Array.isArray(payload.locations) ||
    payload.locations.length > 1000
  ) {
    throw Error(
      "Expected no more than 1000 locations."
    );
  }

  const numbers = new Set();
  const ids = new Set();
  const output = [];

  for (const item of payload.locations) {
    if (!item || typeof item !== "object") {
      throw Error("Invalid location.");
    }

    const type = item.type === undefined
      ? "map"
      : item.type;

    if (
      !["map", "murder", "session"].includes(type)
    ) {
      throw Error("Invalid location type.");
    }

    if (
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 100 ||
      ids.has(item.id)
    ) {
      throw Error(
        "Invalid or duplicate location ID."
      );
    }

    if (
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.length > 120
    ) {
      throw Error("Invalid location title.");
    }

    if (
      typeof item.description !== "string" ||
      item.description.length > 20000
    ) {
      throw Error("Invalid description.");
    }

    if (
      typeof item.photo !== "string" ||
      item.photo.length > 2000
    ) {
      throw Error("Invalid image URL.");
    }

    if (
      !Number.isFinite(item.u) ||
      item.u < 0 ||
      item.u > 1 ||
      !Number.isFinite(item.v) ||
      item.v < 0 ||
      item.v > 1
    ) {
      throw Error("Invalid map coordinates.");
    }

    // Only ordinary Map Locations require numbers.
    if (type === "map") {
      if (
        !Number.isInteger(item.number) ||
        item.number < 1 ||
        item.number > 60 ||
        numbers.has(item.number)
      ) {
        throw Error(
          "Map locations require unique numbers from 1 to 60."
        );
      }

      numbers.add(item.number);
    }

    ids.add(item.id);

    const location = {
      id: item.id,
      type,
      title: item.title,
      description: item.description,
      photo: item.photo,
      u: item.u,
      v: item.v
    };

    if (type === "map") {
      location.number = item.number;
    }

    output.push(location);
  }

  return { locations: output };
}

// CREATE LOCAL SERVER

http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url,
      `http://${host}:${port}`
    );

    // SAVE LOCATIONS TO DISK

    if (
      req.method === "POST" &&
      url.pathname === "/api/locations"
    ) {
      if (
        req.headers.origin !==
        `http://${host}:${port}`
      ) {
        return respond(
          res,
          403,
          "Local editor origin required."
        );
      }

      let body = "";
      let length = 0;

      for await (const chunk of req) {
        length += chunk.length;

        if (length > 1_000_000) {
          return respond(
            res,
            413,
            "Data too large."
          );
        }

        body += chunk.toString("utf8");
      }

      let data;

      try {
        data = validate(JSON.parse(body));

      } catch (error) {
        return respond(
          res,
          400,
          error.message
        );
      }

      const file = path.join(
        root,
        "locations.json"
      );

      const temporary = `${file}.tmp`;

      await fs.writeFile(
        temporary,
        `${JSON.stringify(data, null, 2)}\n`
      );

      await fs.rename(
        temporary,
        file
      );

      return respond(
        res,
        200,
        JSON.stringify({ ok: true }),
        mime[".json"]
      );
    }

    // ALLOW STATIC FILE REQUESTS

    if (
      req.method !== "GET" &&
      req.method !== "HEAD"
    ) {
      return respond(
        res,
        405,
        "Method not allowed."
      );
    }

    // LOCAL DM EDITOR

    if (url.pathname === "/editor") {
      const template = await fs.readFile(
        path.join(root, "index.html"),
        "utf8"
      );

      const html = template.replace(
        '<script src="js/app.js"></script>',
        '<script>window.__SHADOWDALE_EDITOR__=true</script><script src="js/app.js"></script>'
      );

      return respond(
        res,
        200,
        req.method === "HEAD" ? "" : html,
        mime[".html"]
      );
    }

    // RESOLVE REQUESTED PATH

    let requested;

    try {
      requested = decodeURIComponent(
        url.pathname
      );

    } catch {
      return respond(
        res,
        400,
        "Bad path."
      );
    }

    if (requested === "/") {
      requested = "/index.html";
    }

    const file = path.resolve(
      root,
      `.${requested}`
    );

    // BLOCK ACCESS TO SERVER-SIDE FILES

    if (
      !file.startsWith(root + path.sep) ||
      file.includes(path.sep + "tools" + path.sep) ||
      file === path.join(root, "package.json") ||
      file.includes(path.sep + ".git")
    ) {
      return respond(
        res,
        403,
        "Forbidden."
      );
    }

    let stat;

    try {
      stat = await fs.stat(file);

    } catch {
      return respond(
        res,
        404,
        "Not found."
      );
    }

    if (!stat.isFile()) {
      return respond(
        res,
        404,
        "Not found."
      );
    }

    const content = await fs.readFile(file);

    return respond(
      res,
      200,
      req.method === "HEAD" ? "" : content,
      mime[path.extname(file)] ||
        "application/octet-stream"
    );

  } catch (error) {
    console.error(error);

    respond(
      res,
      500,
      "Server error."
    );
  }

}).listen(port, host, () => {
  console.log(
    `\nBlood in Shadowdale DM editor: http://${host}:${port}/editor`
  );

  console.log(
    `Player preview: http://${host}:${port}/`
  );

  console.log(
    "Press Ctrl+C to stop.\n"
  );
});
