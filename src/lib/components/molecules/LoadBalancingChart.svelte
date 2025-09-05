<script>
  import { onMount } from 'svelte';

  let chartContainer;
  let loading = true;
  let error = null;

  // Dynamic statistics that will be updated after data processing
  let stats = {
    leastConnection: {
      avg: 0,
      max: 0,
      min: 0
    },
    roundRobin: {
      avg: 0,
      max: 0,
      min: 0
    },
    improvement: 0
  };

  // Parse CSV data (works for both least connection and round robin)
  function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const data = [];

    for (let i = 1; i < lines.length; i++) { // Skip header
      const values = lines[i].split(',');
      const timestamp = parseInt(values[0]);
      const serverValues = values.slice(1).map(v => parseInt(v) || 0);
      data.push({ timestamp, values: serverValues });
    }

    return data;
  }

  // Parse the round robin text data (Python dict format) - fallback method
  function parseRoundRobinData(textData) {
    const lines = textData.trim().split('\n');
    const data = [];

    lines.forEach((line, index) => {
      try {
        // Replace Python dict format with JSON format
        const jsonLine = line.replace(/'/g, '"').replace(/ws:\/\//g, 'ws://');
        const parsed = JSON.parse(jsonLine);

        // Extract just the numeric values (connection counts)
        const values = Object.values(parsed).map(v => parseInt(v) || 0);
        data.push({ timestamp: index, values });
      } catch (e) {
        console.error('Error parsing line:', line, e);
      }
    });

    return data;
  }

  // Calculate percentage difference between max and min server loads
  function calculateLoadImbalance(values) {
    if (values.length === 0) return 0;

    const max = Math.max(...values);
    const min = Math.min(...values);

    // If all servers have 0 connections, no imbalance
    if (max === 0) return 0;

    // Calculate percentage difference: (max - min) / max * 100
    const imbalance = ((max - min) / max) * 100;
    return imbalance;
  }

  // Get theme-aware colors
  function getThemeColors() {
    const styles = getComputedStyle(document.documentElement);
    const isDarkMode = document.documentElement.classList.contains('dark') ||
                      styles.getPropertyValue('--theme').trim() === 'dark' ||
                      window.matchMedia('(prefers-color-scheme: dark)').matches;

    return {
      // Chart colors - consistent across themes
      danger: '#FF4757',
      success: '#2ED573',
      primary: '#6E29E7',

      // Theme-aware colors
      text: isDarkMode ? '#ffffff' : '#333333',
      textLight: isDarkMode ? '#cccccc' : '#666666',
      background: isDarkMode ? '#1a1a1a' : '#ffffff',
      border: isDarkMode ? '#404040' : '#e0e0e0',
      gridColor: isDarkMode ? '#2a2a2a' : '#f0f0f0'
    };
  }

  // Load and process data
  async function loadData() {
    try {
      const [leastConnResponse, roundRobinResponse] = await Promise.all([
        fetch('/least_connection_sample.csv'),
        fetch('/round_robin.csv')
      ]);

      if (!leastConnResponse.ok || !roundRobinResponse.ok) {
        throw new Error(`Failed to fetch files`);
      }

      const leastConnText = await leastConnResponse.text();
      const roundRobinText = await roundRobinResponse.text();

      // Try to parse Round Robin as CSV first, fallback to Python dict format
      let roundRobinData;
      try {
        roundRobinData = parseCSV(roundRobinText);
      } catch (e) {
        console.log('Round Robin not in CSV format, trying Python dict format');
        roundRobinData = parseRoundRobinData(roundRobinText);
      }

      const leastConnectionData = parseCSV(leastConnText);

      console.log('Least Connection Data:', leastConnectionData.slice(0, 3));
      console.log('Round Robin Data:', roundRobinData.slice(0, 3));

      loading = false;

      setTimeout(() => {
        drawChart(leastConnectionData, roundRobinData);
      }, 100);

    } catch (err) {
      console.error('Error loading data:', err);
      error = err.message;
      loading = false;
    }
  }

  function drawChart(leastConnectionData, roundRobinData) {
    if (!chartContainer) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = 800;
    canvas.height = 400;
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';

    chartContainer.innerHTML = '';
    chartContainer.appendChild(canvas);

    // Get theme colors
    const colors = getThemeColors();

    // Chart dimensions
    const padding = 60;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;

    // Calculate load imbalance percentages over time
    const leastConnImbalances = leastConnectionData.map((row, index) => ({
      timestamp: index,
      imbalance: calculateLoadImbalance(row.values)
    }));

    const roundRobinImbalances = roundRobinData.map((row, index) => ({
      timestamp: index,
      imbalance: calculateLoadImbalance(row.values)
    }));

    console.log('Least Connection Imbalances:', leastConnImbalances.slice(0, 5));
    console.log('Round Robin Imbalances:', roundRobinImbalances.slice(0, 5));

    // Calculate and update statistics
    if (leastConnImbalances.length > 0 && roundRobinImbalances.length > 0) {
      const avgLeastImbalance = leastConnImbalances.reduce((sum, d) => sum + d.imbalance, 0) / leastConnImbalances.length;
      const avgRoundRobinImbalance = roundRobinImbalances.reduce((sum, d) => sum + d.imbalance, 0) / roundRobinImbalances.length;
      const maxRoundRobinImbalance = Math.max(...roundRobinImbalances.map(d => d.imbalance));
      const maxLeastImbalance = Math.max(...leastConnImbalances.map(d => d.imbalance));
      const minRoundRobinImbalance = Math.min(...roundRobinImbalances.map(d => d.imbalance));
      const minLeastImbalance = Math.min(...leastConnImbalances.map(d => d.imbalance));

      // Update stats for the insights section
      stats = {
        leastConnection: {
          avg: avgLeastImbalance,
          max: maxLeastImbalance,
          min: minLeastImbalance
        },
        roundRobin: {
          avg: avgRoundRobinImbalance,
          max: maxRoundRobinImbalance,
          min: minRoundRobinImbalance
        },
        improvement: avgLeastImbalance > 0 ? avgRoundRobinImbalance / avgLeastImbalance : 0
      };
    }

    // Find max values for scaling
    const maxImbalance = Math.max(
      Math.max(...leastConnImbalances.map(d => d.imbalance)),
      Math.max(...roundRobinImbalances.map(d => d.imbalance)),
      10 // Minimum scale to ensure visibility
    );

    const maxTimestamp = Math.max(
      leastConnImbalances.length,
      roundRobinImbalances.length
    );

    console.log('Max imbalance:', maxImbalance);
    console.log('Max timestamp:', maxTimestamp);
    console.log('Avg Least Connection imbalance:',
      leastConnImbalances.reduce((sum, d) => sum + d.imbalance, 0) / leastConnImbalances.length);
    console.log('Avg Round Robin imbalance:',
      roundRobinImbalances.reduce((sum, d) => sum + d.imbalance, 0) / roundRobinImbalances.length);

    // Clear canvas with theme background
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid with theme border color
    ctx.strokeStyle = colors.gridColor;
    ctx.lineWidth = 1;

    // Horizontal grid lines
    for (let i = 0; i <= 8; i++) {
      const y = padding + (i * chartHeight / 8);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
    }

    // Vertical grid lines
    for (let i = 0; i <= 10; i++) {
      const x = padding + (i * chartWidth / 10);
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, padding + chartHeight);
      ctx.stroke();
    }

    // Draw axes with theme text color
    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();

    // Helper function to draw a line
    function drawLine(data, color, label) {
      if (data.length === 0) {
        console.warn(`No data for ${label}`);
        return;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();

      let hasValidPoints = false;
      data.forEach((point, index) => {
        const x = padding + (index / Math.max(maxTimestamp - 1, 1)) * chartWidth;
        const y = padding + chartHeight - (point.imbalance / maxImbalance) * chartHeight;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        hasValidPoints = true;
      });

      if (hasValidPoints) {
        ctx.stroke();

        // Add dots
        ctx.fillStyle = color;
        data.forEach((point, index) => {
          const x = padding + (index / Math.max(maxTimestamp - 1, 1)) * chartWidth;
          const y = padding + chartHeight - (point.imbalance / maxImbalance) * chartHeight;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
          ctx.fill();
        });
      }
    }

    // Draw both lines with consistent colors
    drawLine(roundRobinImbalances, colors.danger, 'Round Robin');
    drawLine(leastConnImbalances, colors.success, 'Least Connection');

    // Draw labels with theme text color
    ctx.fillStyle = colors.text;
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';

    // X-axis labels (time)
    for (let i = 0; i <= 5; i++) {
      const x = padding + (i * chartWidth / 5);
      const timestamp = Math.round((i / 5) * Math.max(maxTimestamp - 1, 1));
      ctx.fillText(timestamp + 's', x, canvas.height - 20);
    }

    // Y-axis labels (percentage difference)
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = padding + chartHeight - (i * chartHeight / 4);
      const percentage = ((i / 4) * maxImbalance).toFixed(0);
      ctx.fillText(percentage + '%', padding - 10, y + 4);
    }

    // Title
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    ctx.fillText('Server Load Imbalance Over Time', canvas.width / 2, 30);

    // Axis labels
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText('Time (seconds)', canvas.width / 2, canvas.height - 5);

    ctx.save();
    ctx.translate(20, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Load Imbalance: (Max-Min)/Max (%)', 0, 0);
    ctx.restore();

    // Legend with consistent colors
    const legendY = padding + 20;
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';

    // Round Robin legend
    ctx.fillStyle = colors.danger;
    ctx.fillRect(padding + 20, legendY, 25, 4);
    ctx.fillStyle = colors.text;
    ctx.fillText('Round Robin', padding + 55, legendY + 8);

    // Least Connection legend
    ctx.fillStyle = colors.success;
    ctx.fillRect(padding + 300, legendY, 25, 4);
    ctx.fillStyle = colors.text;
    ctx.fillText('Least Connection', padding + 335, legendY + 8);

    // Calculate and show statistics only if we have data
    if (leastConnImbalances.length > 0 && roundRobinImbalances.length > 0) {
      const avgLeastImbalance = leastConnImbalances.reduce((sum, d) => sum + d.imbalance, 0) / leastConnImbalances.length;
      const avgRoundRobinImbalance = roundRobinImbalances.reduce((sum, d) => sum + d.imbalance, 0) / roundRobinImbalances.length;
      const maxRoundRobinImbalance = Math.max(...roundRobinImbalances.map(d => d.imbalance));
      const maxLeastImbalance = Math.max(...leastConnImbalances.map(d => d.imbalance));

      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = colors.textLight;
      ctx.textAlign = 'left';
      ctx.fillText(`Round Robin - Avg: ${avgRoundRobinImbalance.toFixed(1)}%, Max: ${maxRoundRobinImbalance.toFixed(1)}%`, padding + 20, canvas.height - 50);
      ctx.fillText(`Least Connection - Avg: ${avgLeastImbalance.toFixed(1)}%, Max: ${maxLeastImbalance.toFixed(1)}%`, padding + 350, canvas.height - 50);

      if (avgLeastImbalance > 0) {
        const improvement = (avgRoundRobinImbalance / avgLeastImbalance).toFixed(1);
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = colors.primary;
        ctx.textAlign = 'center';
        ctx.fillText(`Round Robin has ${improvement}x more load imbalance!`, canvas.width / 2, canvas.height / 2);
      }
    }
  }

  onMount(() => {
    loadData();
  });
</script>

<div class="chart-container">
  {#if loading}
    <div class="loading">📊 Loading chart data...</div>
  {:else if error}
    <div class="error">❌ Error: {error}</div>
  {:else}
    <div bind:this={chartContainer} class="chart"></div>

    <div class="insights">
      <div class="metric-cards">
        <div class="metric-card excellent">
          <h4>🟢 Least Connection</h4>
          <p class="metric">~{stats.leastConnection.min.toFixed(0)}-{stats.leastConnection.max.toFixed(0)}% Imbalance</p>
          <p class="description">Consistently keeps servers within {stats.leastConnection.max.toFixed(0)}% of each other</p>
          <div class="benefit">✅ Maximum server gets only {stats.leastConnection.max.toFixed(0)}% more load than minimum</div>
        </div>

        <div class="metric-card terrible">
          <h4>🔴 Round Robin</h4>
          <p class="metric">~{stats.roundRobin.min.toFixed(0)}-{stats.roundRobin.max.toFixed(0)}% Imbalance</p>
          <p class="description">Creates massive load differences between servers</p>
          <div class="problem">❌ Maximum server can get {stats.roundRobin.max.toFixed(0)}% more load than minimum</div>
        </div>
      </div>

      <div class="key-insight">
        <h4>💡 What This Graph Shows</h4>
        <p>Each point represents the <strong>percentage difference between your most loaded and least loaded server</strong> at that moment:</p>
        <ul>
          <li><strong>Formula:</strong> (Max_Server_Load - Min_Server_Load) / Max_Server_Load × 100</li>
          <li><strong>0% = Perfect balance</strong> - all servers have exactly the same load</li>
          <li><strong>50% = Terrible balance</strong> - the busiest server has twice the load of the quietest server</li>
          <li><strong>Round Robin shows {stats.roundRobin.min.toFixed(0)}-{stats.roundRobin.max.toFixed(0)}% imbalance</strong> - some servers are massively overloaded</li>
          <li><strong>Least Connection stays under {stats.leastConnection.max.toFixed(0)}% imbalance</strong> - servers remain evenly balanced</li>
        </ul>
        <p class="warning">⚠️ In production: {stats.roundRobin.max.toFixed(0)}% imbalance means one server could crash from overload while another sits nearly idle!</p>
        {#if stats.improvement > 1}
          <p class="improvement">📊 <strong>Performance Impact:</strong> Round Robin shows {stats.improvement.toFixed(1)}x more load imbalance than Least Connection (Average: {stats.roundRobin.avg.toFixed(1)}% vs {stats.leastConnection.avg.toFixed(1)}%)</p>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .chart-container {
    width: 100%;
    max-width: 900px;
    margin: 2rem auto;
    padding: 1.5rem;
    border: 1px solid;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);

    /* Light theme styles */
    background: #ffffff;
    border-color: #e0e0e0;
    color: #333333;
  }

  /* Dark theme support */
  @media (prefers-color-scheme: dark) {
    .chart-container {
      background: #1a1a1a;
      border-color: #404040;
      color: #ffffff;
    }
  }

  .loading, .error {
    text-align: center;
    padding: 3rem;
    font-size: 1.2rem;
  }

  .loading {
    color: inherit;
    opacity: 0.7;
  }

  .error {
    color: #ff4444;
    background: rgba(255, 68, 68, 0.1);
    border: 1px solid rgba(255, 68, 68, 0.3);
    border-radius: 8px;
  }

  .chart {
    display: flex;
    justify-content: center;
    margin-bottom: 2rem;
    min-height: 420px;
  }

  .insights {
    margin-top: 2rem;
  }

  .metric-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .metric-card {
    padding: 1.5rem;
    border-radius: 8px;
    text-align: center;
    border: 2px solid;
  }

  .metric-card.excellent {
    background: rgba(46, 213, 115, 0.1);
    border-color: #2ED573;
  }

  .metric-card.terrible {
    background: rgba(255, 71, 87, 0.1);
    border-color: #FF4757;
  }

  .metric-card h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: inherit;
  }

  .metric {
    font-size: 1.4rem;
    font-weight: bold;
    margin: 0.5rem 0;
    color: inherit;
  }

  .description {
    font-size: 0.9rem;
    margin: 0.5rem 0;
    line-height: 1.4;
    color: inherit;
    opacity: 0.8;
  }

  .benefit {
    background: rgba(46, 213, 115, 0.2);
    color: #2ED573;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
    margin-top: 0.5rem;
    font-weight: bold;
  }

  .problem {
    background: rgba(255, 71, 87, 0.2);
    color: #FF4757;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
    margin-top: 0.5rem;
    font-weight: bold;
  }

  .key-insight {
    padding: 1.5rem;
    border-radius: 8px;
    border-left: 4px solid #6E29E7;
    background: rgba(110, 41, 231, 0.05);
  }

  /* Dark theme for key-insight */
  @media (prefers-color-scheme: dark) {
    .key-insight {
      background: rgba(110, 41, 231, 0.1);
    }
  }

  .key-insight h4 {
    margin: 0 0 1rem 0;
    color: inherit;
    font-size: 1.1rem;
  }

  .key-insight p {
    margin: 0 0 1rem 0;
    line-height: 1.6;
    color: inherit;
  }

  .key-insight ul {
    margin: 1rem 0;
    padding-left: 1.5rem;
  }

  .key-insight li {
    margin-bottom: 0.5rem;
    line-height: 1.5;
    color: inherit;
  }

  .warning {
    background: rgba(255, 193, 7, 0.15);
    border: 1px solid rgba(255, 193, 7, 0.4);
    padding: 1rem;
    border-radius: 6px;
    color: #856404;
    font-weight: bold;
  }

  /* Dark theme warning */
  @media (prefers-color-scheme: dark) {
    .warning {
      background: rgba(255, 193, 7, 0.2);
      color: #ffc107;
    }
  }

  .improvement {
    background: rgba(33, 150, 243, 0.15);
    border: 1px solid rgba(33, 150, 243, 0.4);
    padding: 1rem;
    border-radius: 6px;
    color: #1565c0;
    font-weight: bold;
    margin-top: 1rem;
  }

  /* Dark theme improvement */
  @media (prefers-color-scheme: dark) {
    .improvement {
      background: rgba(33, 150, 243, 0.2);
      color: #2196f3;
    }
  }

  @media (max-width: 768px) {
    .metric-cards {
      grid-template-columns: 1fr;
    }

    .chart-container {
      padding: 1rem;
    }

    .chart {
      overflow-x: auto;
    }
  }
</style>