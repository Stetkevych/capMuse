const { fetchAllRepPages, setCors } = require("../_convoso");

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { start_date, end_date } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: "Missing start_date or end_date" });

    const dateStart = `${start_date} 00:00:00`;
    const dateEnd   = `${end_date} 23:59:59`;

    const [instMap, niMap, ncMap] = await Promise.all([
      fetchAllRepPages(dateStart, dateEnd, "inst"),
      fetchAllRepPages(dateStart, dateEnd, "NI"),
      fetchAllRepPages(dateStart, dateEnd, "NC"),
    ]);

    const allIds = new Set([...Object.keys(instMap), ...Object.keys(niMap), ...Object.keys(ncMap)]);
    const users  = {};
    for (const uid of allIds) {
      const instRow = instMap[uid] || {}, niRow = niMap[uid] || {}, ncRow = ncMap[uid] || {};
      const userName = instRow.user || niRow.user || ncRow.user || "";
      if (!userName) continue;
      users[uid] = { user: userName, user_id: uid, inst: instRow.calls || 0, ni: niRow.calls || 0, nc: ncRow.calls || 0 };
    }

    res.json({ start_date, end_date, count: Object.keys(users).length, users: Object.values(users).sort((a, b) => a.user.localeCompare(b.user)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
