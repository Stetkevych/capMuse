const { fetchConvosoData, recordsFromConvoso, getUserCalls, setCors } = require("../_convoso");

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { user, start_date, end_date } = req.body;
    if (!user || !start_date || !end_date) return res.status(400).json({ error: "Missing user, start_date, or end_date" });

    const statuses    = [{ key: "inst", status_ids: "inst" }, { key: "ni", status_ids: "NI" }, { key: "nc", status_ids: "NC" }];
    const finalResult = { user, user_id: null, inst: 0, ni: 0, nc: 0 };

    for (const item of statuses) {
      const data       = await fetchConvosoData("/v1/agent-performance/search", { date_start: `${start_date} 00:00:00`, date_end: `${end_date} 23:59:59`, status_ids: item.status_ids, call_type: "OUTBOUND" });
      const records    = recordsFromConvoso(data);
      const userResult = getUserCalls(records, user);
      finalResult.user      = userResult.user    || finalResult.user;
      finalResult.user_id   = userResult.user_id || finalResult.user_id;
      finalResult[item.key] = userResult.calls;
    }

    res.json(finalResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
