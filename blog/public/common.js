// Shared helpers used by every page.

var DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
      '<rect width="64" height="64" fill="#ccc"/>' +
      '<circle cx="32" cy="24" r="12" fill="#fff"/>' +
      '<ellipse cx="32" cy="58" rx="22" ry="18" fill="#fff"/></svg>'
  );

function api(method, url, body) {
  url = url.replace(/^\//, ""); // relative to this page, so it works inside /blog/
  var opts = { method: method, headers: {}, credentials: "same-origin" };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  return fetch(url, opts).then(function (res) {
    return res.json().then(function (data) {
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      return data;
    });
  });
}

function getMe() {
  return api("GET", "/api/me").then(function (d) { return d.user; });
}

// Top-right corner: "Hi, username!" with a round profile picture to its left.
function renderHeader(user) {
  var box = document.getElementById("top-right");
  box.innerHTML = "";
  box.style.position = "absolute";
  box.style.top = "10px";
  box.style.right = "10px";

  if (!user) return;

  var link = document.createElement("a");
  link.href = "profile.html";
  link.style.textDecoration = "none";
  link.style.color = "inherit";

  var img = document.createElement("img");
  img.src = user.avatar || DEFAULT_AVATAR;
  img.alt = "";
  img.width = 32;
  img.height = 32;
  img.style.borderRadius = "50%";
  img.style.objectFit = "cover";
  img.style.verticalAlign = "middle";
  img.style.marginRight = "8px";

  var text = document.createElement("span");
  text.textContent = "Hi, " + user.username + "!";

  link.appendChild(img);
  link.appendChild(text);
  box.appendChild(link);

  var logout = document.createElement("button");
  logout.textContent = "Logout";
  logout.style.marginLeft = "10px";
  logout.onclick = function () {
    api("POST", "/api/logout").then(function () { location.href = "index.html"; });
  };
  box.appendChild(logout);
}
