/* capmuse-charts.js — Reusable chart builder for any CapMuse page
   Requires Chart.js loaded before this script.
   Usage: CapMuseCharts.init(containerId, dataRows, config)
*/
(function () {
  'use strict';

  var chartInstance = null;

  function monthKey(dateStr) {
    if (!dateStr) return null;
    var d = dateStr.substring(0, 7);
    return d.length === 7 ? d : null;
  }

  function weekKey(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    var day = d.getDay();
    var diff = d.getDate() - day + (day === 0 ? -6 : 1);
    var monday = new Date(d.setDate(diff));
    return monday.toISOString().substring(0, 10);
  }

  function buildUI(containerId, reps, metrics) {
    var el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML =
      '<div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;box-shadow:var(--card-shadow);margin-top:12px">' +
        '<div style="font-size:15px;font-weight:700;margin-bottom:4px">Custom Chart Builder</div>' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Select rep, metric, and time grouping to generate a trend line</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">' +
          '<label style="font-size:11px;font-weight:600;color:var(--text-muted);display:flex;flex-direction:column;gap:4px">Rep<select id="' + containerId + '_rep" style="height:34px;border:1px solid var(--border);border-radius:8px;padding:0 12px;font-size:12.5px;background:var(--surface-2);color:var(--text-primary);outline:none;min-width:160px"></select></label>' +
          '<label style="font-size:11px;font-weight:600;color:var(--text-muted);display:flex;flex-direction:column;gap:4px">Metric<select id="' + containerId + '_metric" style="height:34px;border:1px solid var(--border);border-radius:8px;padding:0 12px;font-size:12.5px;background:var(--surface-2);color:var(--text-primary);outline:none;min-width:140px"></select></label>' +
          '<label style="font-size:11px;font-weight:600;color:var(--text-muted);display:flex;flex-direction:column;gap:4px">Group By<select id="' + containerId + '_group" style="height:34px;border:1px solid var(--border);border-radius:8px;padding:0 12px;font-size:12.5px;background:var(--surface-2);color:var(--text-primary);outline:none"><option value="month">Monthly</option><option value="week">Weekly</option></select></label>' +
          '<button id="' + containerId + '_btn" style="height:34px;border:none;border-radius:8px;background:var(--blue,#2563EB);color:#fff;font-size:12.5px;font-weight:600;padding:0 18px;cursor:pointer">Generate</button>' +
        '</div>' +
        '<div style="position:relative;height:300px"><canvas id="' + containerId + '_canvas"></canvas></div>' +
      '</div>';

    // Populate rep select
    var repSelect = document.getElementById(containerId + '_rep');
    var opt = document.createElement('option');
    opt.value = '__ALL__'; opt.textContent = 'All Reps';
    repSelect.appendChild(opt);
    reps.forEach(function (r) {
      var o = document.createElement('option');
      o.value = r; o.textContent = r;
      repSelect.appendChild(o);
    });

    // Populate metric select
    var metricSelect = document.getElementById(containerId + '_metric');
    metrics.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.key; o.textContent = m.label;
      metricSelect.appendChild(o);
    });
  }

  window.CapMuseCharts = {
    init: function (containerId, rows, config) {
      /*
        config: {
          repField: 'Puller',          // field name for rep
          dateField: 'Created Time',   // field name for date
          metrics: [
            { key: 'apps', label: 'Apps', calc: function(row) { return 1; } },
            { key: 'funded', label: 'Funded', calc: function(row) { return isFunded(row) ? 1 : 0; } },
            ...
          ]
        }
      */
      if (!rows || !rows.length) return;

      var repField = config.repField || 'Puller';
      var dateField = config.dateField || 'Created Time';
      var metrics = config.metrics || [];

      // Extract unique reps
      var repSet = {};
      rows.forEach(function (r) {
        var rep = (r[repField] || '').trim();
        if (rep && rep !== 'House .' && rep !== 'House') repSet[rep] = true;
      });
      var reps = Object.keys(repSet).sort();

      buildUI(containerId, reps, metrics);

      var btn = document.getElementById(containerId + '_btn');
      btn.addEventListener('click', function () {
        var selectedRep = document.getElementById(containerId + '_rep').value;
        var selectedMetric = document.getElementById(containerId + '_metric').value;
        var groupBy = document.getElementById(containerId + '_group').value;

        var metricDef = metrics.find(function (m) { return m.key === selectedMetric; });
        if (!metricDef) return;

        // Aggregate by time
        var buckets = {};
        rows.forEach(function (r) {
          var rep = (r[repField] || '').trim();
          if (selectedRep !== '__ALL__' && rep !== selectedRep) return;
          if (!rep || rep === 'House .' || rep === 'House') return;

          var dateStr = r[dateField] || '';
          var key = groupBy === 'week' ? weekKey(dateStr) : monthKey(dateStr);
          if (!key) return;

          if (!buckets[key]) buckets[key] = 0;
          buckets[key] += metricDef.calc(r);
        });

        var labels = Object.keys(buckets).sort();
        var data = labels.map(function (k) { return buckets[k]; });

        // Format labels
        var displayLabels = labels.map(function (l) {
          if (groupBy === 'week') return l.substring(5);
          var parts = l.split('-');
          var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          return months[parseInt(parts[1]) - 1] + ' ' + parts[0].substring(2);
        });

        var ctx = document.getElementById(containerId + '_canvas').getContext('2d');
        if (chartInstance) chartInstance.destroy();

        var repLabel = selectedRep === '__ALL__' ? 'All Reps' : selectedRep;
        chartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels: displayLabels,
            datasets: [{
              label: repLabel + ' — ' + metricDef.label,
              data: data,
              borderColor: '#2563EB',
              backgroundColor: 'rgba(37,99,235,0.06)',
              tension: 0.3,
              fill: true,
              pointRadius: 2.5,
              pointBackgroundColor: '#2563EB',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } },
              tooltip: { backgroundColor: 'rgba(0,0,0,0.8)', titleFont: { size: 11 }, bodyFont: { size: 11 } }
            },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 10 } } },
              x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45 } }
            }
          }
        });
      });
    }
  };
})();
