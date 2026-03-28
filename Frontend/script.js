// ===== CONFIG =====
const WAQI_TOKEN = "<Add your token>";
const OPENWEATHER_KEY = "<Add your key>";

// ===== APP STATE =====
const appState = {
    currentUser: null,
    currentCity: "San Francisco, CA",
    currentCoords: { lat: 37.7749, lon: -122.4194 },
};

// =======================================
// 1. GEOLOCATION → LAT/LON
// =======================================
async function geocodeLocation(location) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (!data.results || data.results.length === 0) {
            return { error: "Location not found." };
        }

        const loc = data.results[0];
        return {
            lat: loc.latitude,
            lon: loc.longitude,
            name: `${loc.name}, ${loc.admin1 || ""}`.trim(),
        };

    } catch (err) {
        return { error: "Geocoding failed." };
    }
}

// =======================================
// 2. WAQI → REAL AQI
// =======================================
async function getAQIFromWAQI(lat, lon) {
    const url = `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${WAQI_TOKEN}`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (data.status !== "ok") return { error: "No AQI data." };

        return {
            aqi: data.data.aqi,
            pm25: data.data.iaqi.pm25?.v ?? null,
            pm10: data.data.iaqi.pm10?.v ?? null,
            o3: data.data.iaqi.o3?.v ?? null,
            no2: data.data.iaqi.no2?.v ?? null,
            so2: data.data.iaqi.so2?.v ?? null,
            co: data.data.iaqi.co?.v ?? null,
            // NEW: Forecast Data
            forecast: data.data.forecast?.daily ?? null
        };

    } catch (err) {
        console.error("WAQI error:", err);
        return { error: "AQI fetch failed." };
    }
}

// =======================================
// 3. Health + Exercise Recommendations
// =======================================
function updateHealthRecommendations(aqi) {
    const maskBox = document.getElementById("mask-recommendation");
    const exerciseBox = document.getElementById("exercise-safe");

    if (aqi <= 50) {
        maskBox.innerText = "Not Required";
        exerciseBox.innerText = "Safe";
    } else if (aqi <= 100) {
        maskBox.innerText = "Optional";
        exerciseBox.innerText = "Moderate";
    } else if (aqi <= 150) {
        maskBox.innerText = "Recommended for Sensitive Groups";
        exerciseBox.innerText = "Limit Outdoor Activity";
    } else if (aqi <= 200) {
        maskBox.innerText = "Recommended";
        exerciseBox.innerText = "Avoid Outdoor Exercise";
    } else {
        maskBox.innerText = "Required";
        exerciseBox.innerText = "Indoor Only";
    }
}

// =======================================
// 4. UPDATE HOME TAB WITH REAL DATA
// =======================================
function getAQIColor(aqi) {
    if (aqi == null) return "var(--color-bg-1)";
    if (aqi <= 50) return "var(--aqi-good)";
    if (aqi <= 100) return "var(--aqi-moderate)";
    if (aqi <= 150) return "var(--aqi-unhealthy-sensitive)";
    if (aqi <= 200) return "var(--aqi-unhealthy)";
    if (aqi <= 300) return "var(--aqi-very-unhealthy)";
    return "var(--aqi-hazardous)";
}

function getAQILabel(aqi) {
    if (aqi == null) return "Unknown";
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for Sensitive Groups";
    if (aqi <= 200) return "Unhealthy";
    if (aqi <= 300) return "Very Unhealthy";
    return "Hazardous";
}

// =======================================
// NEW: LIVE DATA POLLING (ESP32)
// =======================================
let liveDataInterval = null;

async function pollLiveData() {
    try {
        const res = await fetch("http://localhost:8000/api/data/live");
        if (!res.ok) return;
        const liveData = await res.json();
        renderLocalBlock(liveData);
    } catch (err) {
        console.warn("Could not reach backend for live data", err);
        renderLocalBlock({ connected: false });
    }
}

function startLivePolling() {
    if (liveDataInterval) clearInterval(liveDataInterval);
    pollLiveData(); // Initial fetch
    liveDataInterval = setInterval(pollLiveData, 5000);
}

function stopLivePolling() {
    if (liveDataInterval) {
        clearInterval(liveDataInterval);
        liveDataInterval = null;
    }
}

function renderLocalBlock(data) {
    const badge = document.getElementById("band-status-badge");
    const fmt = (v) => v != null ? (+v).toFixed(1) : "--";

    if (data.connected && data.timestamp) {
        badge.innerText = "Connected";
        badge.className = "band-status-badge status-connected";
        document.getElementById("local-last-sync").innerText = "Last sync: just now";
    } else {
        badge.innerText = "Searching...";
        badge.className = "band-status-badge status-disconnected";
        // Do not clear the last known values, just show disconnected
    }

    if (data.pm25 != null) {
        let aqiColor = getAQIColor(data.pm25); // Rough AQI approx
        const hero = document.getElementById("local-aqi-hero");
        hero.style.backgroundColor = aqiColor;
        document.getElementById("local-pm25-display").innerText = fmt(data.pm25);
    }

    document.getElementById("local-temp").innerText = data.temperature != null ? fmt((data.temperature * 9 / 5) + 32) + " °F" : "--";
    document.getElementById("local-humidity").innerText = data.humidity != null ? fmt(data.humidity) + " %" : "--";
    document.getElementById("local-pressure").innerText = data.pressure != null ? fmt(data.pressure) + " hPa" : "--";
    document.getElementById("local-gas").innerText = data.gas_resistance != null ? fmt(data.gas_resistance / 1000) + " kΩ" : "--";

    document.getElementById("local-pm1").innerText = fmt(data.pm1_0);
    document.getElementById("local-pm25").innerText = fmt(data.pm25);
    document.getElementById("local-pm10").innerText = fmt(data.pm10);
    document.getElementById("local-altitude").innerText = data.altitude != null ? fmt(data.altitude) + " m" : "--";
}

// =======================================
// CLOUD DATA (WAQI)
// =======================================
function renderCloudBlock(data, cityName) {
    document.getElementById("current-location").innerText = cityName;

    // Cloud AQI Hero
    const hero = document.getElementById("aqi-hero");
    hero.style.backgroundColor = getAQIColor(data.aqi);
    document.getElementById("aqi-number").innerText = data.aqi ?? "--";
    document.getElementById("aqi-label").innerText = getAQILabel(data.aqi);

    // Cloud metrics
    document.getElementById("cloud-pm25").innerText = data.pm25 ?? "--";

    const maskBox = document.getElementById("mask-recommendation");
    const exerciseBox = document.getElementById("exercise-safe");
    const categoryBox = document.getElementById("health-advisory");

    categoryBox.innerText = getAQILabel(data.aqi);

    if (data.aqi == null) {
        maskBox.innerText = "--";
        exerciseBox.innerText = "--";
    } else if (data.aqi <= 50) {
        maskBox.innerText = "Not Required";
        exerciseBox.innerText = "Safe";
    } else if (data.aqi <= 100) {
        maskBox.innerText = "Optional";
        exerciseBox.innerText = "Moderate";
    } else if (data.aqi <= 150) {
        maskBox.innerText = "Recommended";
        exerciseBox.innerText = "Limit Action";
    } else if (data.aqi <= 200) {
        maskBox.innerText = "Recommended";
        exerciseBox.innerText = "Avoid Action";
    } else {
        maskBox.innerText = "Required";
        exerciseBox.innerText = "Indoor Only";
    }

    // Detailed Pollutants Grid
    const grid = document.getElementById("pollutants-grid");
    grid.innerHTML = "";

    const pollutants = [
        { label: "PM2.5", value: data.pm25 },
        { label: "PM10", value: data.pm10 },
        { label: "CO", value: data.co },
        { label: "NO₂", value: data.no2 },
        { label: "SO₂", value: data.so2 },
        { label: "O₃", value: data.o3 },
    ];

    pollutants.forEach(p => {
        if (p.value === null) return;
        const card = document.createElement("div");
        card.className = "pollutant-card";
        card.innerHTML = `
            <div class="pollutant-name">${p.label}</div>
            <div class="pollutant-value">${p.value}</div>
        `;
        grid.appendChild(card);
    });
}

function updateHomeUI(data, cityName) {
    renderCloudBlock(data, cityName);
}

// =======================================
// 7. HEALTH TAB LOGIC
// =======================================
async function addHealthEntry() {
    const dateInput = document.getElementById("symptom-date");
    const notesInput = document.getElementById("symptom-notes");

    // Get checked checkboxes
    const checkboxes = document.querySelectorAll(".checkbox-group input:checked");
    const symptoms = Array.from(checkboxes).map(cb => cb.value);

    // Logic: Validation
    if (!dateInput.value) {
        return alert("Please select a date.");
    }
    if (symptoms.length === 0 && !notesInput.value.trim()) {
        return alert("Please log at least one symptom or note.");
    }

    try {
        const payload = {
            date: dateInput.value,
            symptoms: symptoms,
            notes: notesInput.value.trim()
        };

        const res = await fetch("http://localhost:8000/api/symptoms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("Entry Saved! 💊");
            // Clear form
            dateInput.value = "";
            notesInput.value = "";
            checkboxes.forEach(cb => cb.checked = false);
            // Refresh list
            fetchHealthEntries();
        } else {
            alert("Error saving entry.");
        }
    } catch (err) {
        console.error(err);
        alert("Backend Offline?");
    }
}

async function fetchHealthEntries() {
    try {
        const res = await fetch("http://localhost:8000/api/symptoms");
        const entries = await res.json();

        const container = document.getElementById("health-entries");
        container.innerHTML = "";

        if (!entries || entries.length === 0) {
            container.innerHTML = "<div style='opacity:0.6; text-align:center;'>No entries yet.</div>";
            return;
        }

        entries.forEach(e => {
            const date = new Date(e.date).toLocaleDateString();
            // e.symptoms is a string "cough,headache" from DB
            const symptomList = e.symptoms ? e.symptoms.split(",").map(s => `<span class="tag">${s}</span>`).join(" ") : "";

            const div = document.createElement("div");
            div.className = "health-entry-card";
            div.style.background = "rgba(255,255,255,0.05)";
            div.style.padding = "10px";
            div.style.marginBottom = "8px";
            div.style.borderRadius = "8px";

            div.innerHTML = `
                <div style="font-weight:bold; color:var(--primary);">${date}</div>
                <div style="margin:4px 0;">${symptomList}</div>
                <div style="font-size:0.9em; opacity:0.8;">${e.notes || ""}</div>
            `;
            container.appendChild(div);
        });

    } catch (err) {
        console.warn("Could not fetch health entries");
    }
}

// =======================================
// 8. MAP TAB LOGIC (Regional Data)
// =======================================
async function fetchMapData() {
    try {
        const { lat, lon } = appState.currentCoords;
        const res = await fetch(`http://localhost:8000/api/nearby?lat=${lat}&lon=${lon}`);
        const data = await res.json();

        if (data.error || !data.cities) return;

        const grid = document.getElementById("nearby-areas");
        grid.innerHTML = "";

        if (data.cities.length === 0) {
            grid.innerHTML = "<div style='opacity:0.6; width:100%; text-align:center;'>No nearby stations found.</div>";
            return;
        }

        data.cities.forEach(city => {
            const card = document.createElement("div");
            card.className = "map-card";
            // Simple styling inline or add to CSS
            card.style.background = "var(--surface-color)";
            card.style.padding = "15px";
            card.style.borderRadius = "12px";
            card.style.textAlign = "center";
            card.style.border = "1px solid rgba(255,255,255,0.1)";

            const color = getAQIColor(city.aqi);

            card.innerHTML = `
                <div style="font-size:1.1em; font-weight:bold; margin-bottom:5px;">${city.city}</div>
                <div style="font-size:2em; font-weight:bold; color:${color};">${city.aqi || "--"}</div>
                <div style="font-size:0.9em; opacity:0.7;">${city.category}</div>
            `;
            grid.appendChild(card);
        });

    } catch (err) {
        console.warn("Could not fetch map data", err);
    }
}

// =======================================
// 10. NEWS TAB LOGIC (Simulated)
// =======================================
// =======================================
// 10. NEWS TAB LOGIC (Interactive)
// =======================================
let currentNewsData = []; // Store data globally to access in modal

function fetchNews() {
    currentNewsData = [
        {
            title: "Wildfire Season 2026: Preparation Guide",
            source: "CalFire Daily",
            date: "2 hours ago",
            icon: "🔥",
            summary: "Experts warn of an early fire season this year. Learn how to seal your home and prepare your 'Go Bag' with N95 masks.",
            fullContent: `
                <p><strong>California is facing a potentially severe wildfire season this year</strong>, driven by specifically dry winter conditions and increased vegetation growth from early spring rains. CalFire officials have issued an early warning for residents in high-risk zones.</p>
                <br>
                <h3>How to Prepare Your Home</h3>
                <p>Creating "defensible space" is your first line of defense. Clear dead vegetation within 100 feet of your home. Ensure your gutters are free of dry leaves, and consider upgrading to mesh vents to prevent embers from entering your attic.</p>
                <br>
                <h3>The "Go Bag" Essentials</h3>
                <p>When an evacuation order hits, you may have minutes, not hours. Your emergency kit should include N95 respirators (cloth masks do not filter smoke particles), a 3-day supply of water, battery-powered radio, and copies of important documents. Don't forget medication and pet supplies.</p>
            `
        },
        {
            title: "Understanding PM2.5: The Invisible Killer",
            source: "Health Science Weekly",
            date: "5 hours ago",
            icon: "🔬",
            summary: "New research links long-term PM2.5 exposure to cardiovascular health. Why your AirSense band is more important than ever.",
            fullContent: `
                <p><strong>Particulate Matter 2.5 (PM2.5)</strong> refers to tiny particles less than 2.5 micrometers in diameter—about 3% the diameter of a human hair. Because they are so small, they can bypass the nose's filtration system and lodge deep into the lungs, sometimes entering the bloodstream.</p>
                <br>
                <h3>The Health Impact</h3>
                <p>Recent studies from the World Health Organization suggest that there is no "safe" level of PM2.5. Chronic exposure is linked not just to asthma, but to heart attacks, strokes, and cognitive decline in elderly populations.</p>
                <br>
                <h3>How AirSense Helps</h3>
                <p>Most weather apps give you a city-wide average. However, pollution is hyper-local. A bus idling next to you or a neighbor's BBQ can spike local PM2.5 levels to "Hazardous" ranges locally, even if the city average is "Good". Your BreatheBand detects these immediate threats so you can move to clean air instantly.</p>
            `
        },
        {
            title: "Global Air Quality Report Released",
            source: "World Air Watch",
            date: "1 day ago",
            icon: "🌍",
            summary: "Urban centers show a 5% improvement in air quality metrics compared to last year, thanks to new EV policies.",
            fullContent: `
                <p>The annual <strong>global air quality report</strong> brings a glimmer of hope this year. For the first time in a decade, major metropolitan areas have recorded a 5% year-over-year drop in Nitrogen Dioxide (NO2) levels.</p>
                <br>
                <h3>The EV Effect</h3>
                <p>Analysts credit the rapid adoption of Electric Vehicles (EVs) and hybrid fleets for public transit. Cities like London and Los Angeles, which have implemented strict Low Emission Zones, are seeing the fastest improvements.</p>
                <br>
                <h3>Still Work To Do</h3>
                <p>Despite improvements in NO2, industrial particulate matter remains a challenge in developing nations. The report calls for stricter regulation on coal plants and agricultural burning, which continue to drive cross-border pollution events.</p>
            `
        },
        {
            title: "Top 5 Houseplants for Cleaner Air",
            source: "Green Living",
            date: "2 days ago",
            icon: "🌱",
            summary: "Snake plants and Spider plants aren't just pretty—they actively filter VOCs from your bedroom air.",
            fullContent: `
                <p>Did you know the air inside your home can be up to 5 times more polluted than the air outside? Volatile Organic Compounds (VOCs) off-gas from furniture, paint, and cleaning supplies. Nature has a solution.</p>
                <br>
                <h3>1. Snake Plant (Sansevieria)</h3>
                <p>Also known as "Mother-in-Law's Tongue," this plant is unique because it releases oxygen <em>at night</em>, making it perfect for bedrooms. It filters formaldehyde and benzene.</p>
                <br>
                <h3>2. Spider Plant</h3>
                <p>Resilient and pet-safe, the Spider Plant is a powerhouse for removing carbon monoxide and xylene. Plus, it propagates easily, so you can grow an entire air-cleaning army from one plant.</p>
                <br>
                <h3>3. Peace Lily</h3>
                <p>While it requires more water, the Peace Lily is one of the few plants that can scrub ammonia from the air. Note: It is toxic to cats, so place it high up!</p>
            `
        }
    ];

    const container = document.getElementById("news-scroll");
    if (!container) return;
    container.innerHTML = "";

    currentNewsData.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "news-card"; // Add styling for this
        // Inline styles for now
        card.style.background = "var(--surface-color)";
        card.style.padding = "20px";
        card.style.borderRadius = "16px";
        card.style.marginBottom = "16px";
        card.style.display = "flex";
        card.style.gap = "15px";
        card.style.alignItems = "start";
        card.style.border = "1px solid rgba(255,255,255,0.05)";
        card.style.cursor = "pointer";
        card.onclick = () => openNewsModal(index);

        card.innerHTML = `
            <div style="font-size:2.5em; background:rgba(255,255,255,0.1); padding:10px; border-radius:12px;">${item.icon}</div>
            <div>
                <div style="font-size:1.1em; font-weight:bold; margin-bottom:4px; color: var(--color-text);">${item.title}</div>
                <div style="font-size:0.8em; opacity:0.6; margin-bottom:8px;">${item.source} • ${item.date}</div>
                <div style="font-size:0.9em; opacity:0.8; line-height:1.4;">${item.summary}</div>
                <div style="margin-top:8px; font-size:0.8em; color:var(--primary); font-weight:bold;">Read More &rarr;</div>
            </div>
        `;
        container.appendChild(card);
    });
}

function openNewsModal(index) {
    const item = currentNewsData[index];
    if (!item) return;

    document.getElementById("modal-icon").innerText = item.icon;
    document.getElementById("modal-title").innerText = item.title;
    document.getElementById("modal-meta").innerText = `${item.source} • ${item.date}`;
    document.getElementById("modal-body").innerHTML = item.fullContent;

    const modal = document.getElementById("news-modal");
    modal.style.display = "flex";
}

function closeNewsModal() {
    const modal = document.getElementById("news-modal");
    modal.style.display = "none";
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById("news-modal");
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

// =======================================
// 9. WEEKLY FORECAST LOGIC
// =======================================
function updateForecastUI(dailyForecast) {
    const grid = document.getElementById("forecast-grid");
    if (!grid) return;
    grid.innerHTML = "";

    if (!dailyForecast || !dailyForecast.pm25) {
        grid.innerHTML = "<p>No forecast data available.</p>";
        return;
    }

    // We get a list of days. Filter for Today + Future, then sort.
    const todayStr = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

    let days = dailyForecast.pm25
        .filter(d => d.day >= todayStr) // Remove past days
        .sort((a, b) => new Date(a.day) - new Date(b.day)); // Ensure chronological order

    // Take up to 7 days (User requested more than 6)
    days = days.slice(0, 7);

    // LOGIC: Find 2 cleanest days
    // Clone array so we don't mess up order
    const sortedDays = [...days].sort((a, b) => a.avg - b.avg);
    const bestDays = sortedDays.slice(0, 2);

    // Format names: "Monday & Wednesday"
    const bestDayNames = bestDays.map(d =>
        new Date(d.day).toLocaleDateString('en-US', { weekday: 'long' })
    );

    const insightDiv = document.getElementById("forecast-insight");
    if (insightDiv) {
        insightDiv.innerHTML = `<strong>Insight:</strong> The cleanest days will be <strong>${bestDayNames.join(" and ")}</strong>.`;
    }

    days.forEach(dayData => {
        // dayData = { day: "2023-10-27", avg: 141, min: ..., max: ... }
        const dateObj = new Date(dayData.day);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        const dateNum = dateObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });

        // We use 'avg' PM2.5 to estimate AQI color
        const estimatedAQI = dayData.avg;
        const color = getAQIColor(estimatedAQI);

        const card = document.createElement("div");
        card.className = "forecast-card";
        // Inline styles for quick prototyping
        card.style.background = "var(--surface-color)";
        card.style.padding = "15px";
        card.style.borderRadius = "12px";
        card.style.textAlign = "center";
        card.style.borderTop = `4px solid ${color}`;

        card.innerHTML = `
            <div style="font-weight:bold; margin-bottom:5px;">${dayName}</div>
            <div style="font-size:0.8em; opacity:0.7; margin-bottom:10px;">${dateNum}</div>
            <div style="font-size:1.4em; font-weight:bold; color:${color};">${estimatedAQI}</div>
            <div style="font-size:0.8em;">Avg PM2.5</div>
        `;
        grid.appendChild(card);
    });
}

// =======================================
// 5. HANDLE LOCATION UPDATE
// =======================================
async function updateLocationFromSearch() {
    const input = document.getElementById("locationSearchInput");
    const query = input.value.trim();

    if (!query) return alert("Enter a city name.");

    // Step 1: Convert city → lat/lon
    const geo = await geocodeLocation(query);
    if (geo.error) return alert(geo.error);

    // Save state
    appState.currentCity = geo.name;
    appState.currentCoords = { lat: geo.lat, lon: geo.lon };

    // Step 2: Fetch AQI
    const aqiData = await getAQIFromWAQI(geo.lat, geo.lon);
    if (aqiData.error) return alert(aqiData.error);

    // Step 3: Update UI
    updateHomeUI(aqiData, geo.name);

    // Step 4: Update Forecast
    updateForecastUI(aqiData.forecast);

    // Step 5: Update Map/Nearby Areas
    fetchMapData();

    alert("Location updated!");
}

// =======================================
// 6. WIRE UP BUTTON (THIS WAS MISSING)
// =======================================
document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("locationSearchBtn");
    if (btn) {
        btn.addEventListener("click", updateLocationFromSearch);
    }

    // NEW: Start Live Polling for BreatheBand Local Data
    startLivePolling();

    // NEW: Fetch WAQI Cloud Data immediately on load
    getAQIFromWAQI(appState.currentCoords.lat, appState.currentCoords.lon).then(aqiData => {
        if (!aqiData.error) {
            updateHomeUI(aqiData, appState.currentCity);
            if (typeof updateForecastUI === "function") {
                updateForecastUI(aqiData.forecast);
            }
        }
    });

    // Initialize Theme override
    initializeTheme();

    // NEW: Fetch health entries when page loads
    fetchHealthEntries();

    // NEW: Fetch Map data
    fetchMapData();

    // NEW: Fetch News
    fetchNews();
});

// =======================================
// 12. PAST DATA TAB (Redesign)
// =======================================
const pastDataState = {
    data: [],           // Displayed dataset
    mode: 'daily',      // 'daily' (Last 10 Days) or 'hourly' (Single Day)
    date: null,         // currently selected date string YYYY-MM-DD
    view: 'charts',     // 'charts' or 'table'
    charts: {},         // Chart.js instances keyed by id
    loaded: false,
};

async function fetchPastData() {
    let url = `http://localhost:8000/api/data/history?granularity=${pastDataState.mode}`;
    if (pastDataState.mode === 'daily') {
        url += `&days=10`;
    } else {
        url += `&date=${pastDataState.date}`;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Bad response');

        const payload = await res.json();

        // Helper to convert C->F and Ohms->Kiloohms
        const convertUnits = (r) => {
            const out = { ...r };
            if (out.temperature != null) out.temperature = (out.temperature * 9 / 5) + 32;
            if (out.temperature_min != null) out.temperature_min = (out.temperature_min * 9 / 5) + 32;
            if (out.temperature_max != null) out.temperature_max = (out.temperature_max * 9 / 5) + 32;
            if (out.temperature_avg != null) out.temperature_avg = (out.temperature_avg * 9 / 5) + 32;

            if (out.gas_resistance != null) out.gas_resistance = out.gas_resistance / 1000;
            if (out.gas_resistance_min != null) out.gas_resistance_min = out.gas_resistance_min / 1000;
            if (out.gas_resistance_max != null) out.gas_resistance_max = out.gas_resistance_max / 1000;
            if (out.gas_resistance_avg != null) out.gas_resistance_avg = out.gas_resistance_avg / 1000;
            return out;
        };

        // API returns a flat array for daily, or {date, granularity, readings} for hourly
        if (Array.isArray(payload)) {
            pastDataState.data = payload.map(convertUnits);
        } else {
            pastDataState.data = (payload.readings || []).map(convertUnits);
        }
    } catch (err) {
        console.warn('Could not fetch past data:', err);
        pastDataState.data = [];
    }

    renderPastDataView();
}

function renderPastDataView() {
    const hasData = pastDataState.data.length > 0;

    document.getElementById('past-data-empty').style.display = hasData ? 'none' : 'block';

    document.getElementById('past-data-charts-view').style.display =
        (hasData && pastDataState.view === 'charts') ? 'block' : 'none';

    document.getElementById('past-data-table-view').style.display =
        (hasData && pastDataState.view === 'table') ? 'block' : 'none';

    if (!hasData) return;

    if (pastDataState.view === 'charts') {
        renderPastDataCharts(pastDataState.data, pastDataState.mode);
    } else {
        renderPastDataTable(pastDataState.data, pastDataState.mode);
    }
}

function setPastMode(mode, btn) {
    pastDataState.mode = mode;
    btn.closest('.filter-pills').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const dp = document.getElementById("past-date-picker-group");
    if (mode === 'hourly') {
        dp.style.display = "flex";
        if (!pastDataState.date) {
            const now = new Date();
            const localDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            pastDataState.date = localDate;
            document.getElementById("past-date-input").value = localDate;
        }
    } else {
        dp.style.display = "none";
    }

    fetchPastData();
}

function onPastDateChange() {
    pastDataState.date = document.getElementById("past-date-input").value;
    fetchPastData();
}

function setPastViewFilter(view, btn) {
    pastDataState.view = view;
    btn.closest('.filter-pills').querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPastDataView();
}

// ----- Chart Rendering -----

function getPastChartDefaults(isDark) {
    const textColor = isDark ? 'rgba(245,245,245,0.8)' : 'rgba(31,33,33,0.8)';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: textColor, font: { size: 12 } }, position: 'top' },
            tooltip: { mode: 'index', intersect: false },
        },
        scales: {
            x: {
                ticks: { color: textColor, maxRotation: 45, font: { size: 10 }, maxTicksLimit: 8 },
                grid: { color: gridColor },
            },
            y: {
                ticks: { color: textColor, font: { size: 10 } },
                grid: { color: gridColor },
            },
        },
        elements: { point: { radius: 2, hoverRadius: 5 }, line: { tension: 0.3 } },
        animation: { duration: 400 },
    };
}

function destroyChart(id) {
    if (pastDataState.charts[id]) {
        pastDataState.charts[id].destroy();
        delete pastDataState.charts[id];
    }
}

function buildChart(id, config) {
    destroyChart(id);
    const ctx = document.getElementById(id);
    if (!ctx) return;
    pastDataState.charts[id] = new Chart(ctx, config);
}

function renderPastDataCharts(data, mode) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.hasAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const defaults = getPastChartDefaults(isDark);

    // Labels format based on mode
    const labels = data.map(r => {
        if (mode === 'daily') {
            const d = new Date(r.day + 'T12:00:00Z'); // force midday UTC so browser timezone doesn't shift the day
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        } else {
            // hourly or 5-min
            const key = 'hour' in r ? r.hour : r['bucket_5min'];
            const d = new Date(key + 'Z');
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
    });

    const fmtVal = v => (v != null ? +v.toFixed(2) : null);

    // For Daily mode we plot the AVG, for Hourly we plot the raw (which is already avg)
    const getVal = (r, field) => {
        if (mode === 'daily') return fmtVal(r[field + '_avg']);
        return fmtVal(r[field]);
    };

    // For Daily mode we can also plot min/max bands if we want, but for simpicity let's just plot avg.
    // If you want Min/Max, we add it as extra datasets without fill.

    function makeDataset(label, field, baseColorHex, bgRgba) {
        let datasets = [{
            label: label + (mode === 'daily' ? ' (Avg)' : ''),
            data: data.map(r => getVal(r, field)),
            borderColor: baseColorHex,
            backgroundColor: bgRgba,
            fill: mode !== 'daily', // Fill hourly, keep daily clean lines
        }];

        if (mode === 'daily') {
            const lightColor = baseColorHex + '66'; // add alpha
            datasets.push({
                label: 'Max',
                data: data.map(r => fmtVal(r[field + '_max'])),
                borderColor: lightColor,
                borderDash: [5, 5],
                borderWidth: 1,
                pointRadius: 0,
            });
            datasets.push({
                label: 'Min',
                data: data.map(r => fmtVal(r[field + '_min'])),
                borderColor: lightColor,
                borderDash: [5, 5],
                borderWidth: 1,
                pointRadius: 0,
            });
        }
        return datasets;
    }

    // --- PM Combined Chart ---
    const pmDatasets = [];
    if (mode === 'daily') {
        pmDatasets.push({
            label: 'PM1.0 (Avg)', data: data.map(r => fmtVal(r.pm1_0_avg)), borderColor: '#A855F7'
        }, {
            label: 'PM2.5 (Avg)', data: data.map(r => fmtVal(r.pm25_avg)), borderColor: '#F59E0B'
        }, {
            label: 'PM10 (Avg)', data: data.map(r => fmtVal(r.pm10_avg)), borderColor: '#EF4444'
        });
    } else {
        pmDatasets.push({
            label: 'PM1.0', data: data.map(r => fmtVal(r.pm1_0)), borderColor: '#A855F7', fill: true, backgroundColor: 'rgba(168,85,247,0.1)'
        }, {
            label: 'PM2.5', data: data.map(r => fmtVal(r.pm25)), borderColor: '#F59E0B', fill: true, backgroundColor: 'rgba(245,158,11,0.1)'
        }, {
            label: 'PM10', data: data.map(r => fmtVal(r.pm10)), borderColor: '#EF4444', fill: true, backgroundColor: 'rgba(239,68,68,0.1)'
        });
    }

    buildChart('chart-pm', { type: 'line', data: { labels, datasets: pmDatasets }, options: { ...defaults } });
    buildChart('chart-temperature', { type: 'line', data: { labels, datasets: makeDataset('Temperature (°F)', 'temperature', '#F97316', 'rgba(249,115,22,0.1)') }, options: { ...defaults } });
    buildChart('chart-humidity', { type: 'line', data: { labels, datasets: makeDataset('Humidity (%)', 'humidity', '#3B82F6', 'rgba(59,130,246,0.1)') }, options: { ...defaults } });
    buildChart('chart-pressure', { type: 'line', data: { labels, datasets: makeDataset('Pressure (hPa)', 'pressure', '#2DD4BF', 'rgba(45,212,191,0.1)') }, options: { ...defaults } });
    buildChart('chart-gas', { type: 'line', data: { labels, datasets: makeDataset('Gas Res. (kΩ)', 'gas_resistance', '#10B981', 'rgba(16,185,129,0.1)') }, options: { ...defaults } });
    buildChart('chart-altitude', { type: 'line', data: { labels, datasets: makeDataset('Altitude (m)', 'altitude', '#64748B', 'rgba(100,116,139,0.1)') }, options: { ...defaults } });
}

// ----- Table Rendering -----

function renderPastDataTable(data, mode) {
    const tbody = document.getElementById('past-data-table-body');
    if (!tbody) return;
    const fmt = v => (v != null ? (+v).toFixed(1) : '—');

    if (mode === 'daily') {
        const trs = data.map(r => `<tr>
            <td>${r.day}</td>
            <td>Avg ${fmt(r.temperature_avg)} <br><span style="font-size:0.8em;opacity:0.6">${fmt(r.temperature_min)} – ${fmt(r.temperature_max)}</span></td>
            <td>Avg ${fmt(r.humidity_avg)} <br><span style="font-size:0.8em;opacity:0.6">${fmt(r.humidity_min)} – ${fmt(r.humidity_max)}</span></td>
            <td>Avg ${fmt(r.pressure_avg)}</td>
            <td>Avg ${fmt(r.gas_resistance_avg)}</td>
            <td>Avg ${fmt(r.pm1_0_avg)}</td>
            <td>Avg ${fmt(r.pm25_avg)}</td>
            <td>Avg ${fmt(r.pm10_avg)}</td>
            <td>Avg ${fmt(r.altitude_avg)}</td>
        </tr>`);
        tbody.innerHTML = trs.join('');
    } else {
        const trs = data.map(r => {
            const key = 'hour' in r ? r.hour : r['bucket_5min'];
            const ts = new Date(key + 'Z').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            return `<tr>
                <td>${ts}</td>
                <td>${fmt(r.temperature)}</td>
                <td>${fmt(r.humidity)}</td>
                <td>${fmt(r.pressure)}</td>
                <td>${fmt(r.gas_resistance)}</td>
                <td>${fmt(r.pm1_0)}</td>
                <td>${fmt(r.pm25)}</td>
                <td>${fmt(r.pm10)}</td>
                <td>${fmt(r.altitude)}</td>
            </tr>`;
        });
        tbody.innerHTML = trs.join('');
    }
}

// =======================================
// 7. LOGIN + TAB SYSTEM
// =======================================
function switchTab(tabName) {
    document.querySelectorAll(".tab-content").forEach(t => {
        t.style.display = "none";
    });

    document.getElementById(`${tabName}-tab`).style.display = "block";

    const navBar = document.querySelector(".nav-bar");
    if (navBar) {
        navBar.style.display = tabName === "login" ? "none" : "flex";
    }

    // Start/stop polling based on home tab
    if (tabName === "home") {
        startLivePolling();
    } else {
        stopLivePolling();
    }

    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });

    const activeNav = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeNav) {
        activeNav.classList.add("active");
    }

    // Auto-fetch past data on first open
    if (tabName === 'past-data' && !pastDataState.loaded) {
        pastDataState.loaded = true;
        fetchPastData();
    }
}

function handleLogout() {
    appState.currentUser = null;
    switchTab("login");
}

// =======================================
// 11. AUTH LOGIC (Real Backend)
// =======================================
function getInitials(name) {
    if (!name) return "??";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function handleRegister() {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const fullName = document.getElementById("login-name").value;
    const age = document.getElementById("user-age").value;

    if (!email || !password || !age || !fullName) {
        return alert("Please fill in all fields.");
    }

    try {
        const res = await fetch("http://localhost:8000/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, full_name: fullName, age: parseInt(age) })
        });

        const data = await res.json();

        if (res.ok) {
            alert("Account Created! Logging you in...");
            handleLogin(); // Auto-login
        } else {
            alert("Error: " + data.detail);
        }
    } catch (err) {
        console.error(err);
        alert("Server Error");
    }
}

async function handleLogin() {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    if (!email || !password) return alert("Enter email and password.");

    try {
        const res = await fetch("http://localhost:8000/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
            // Success!
            appState.currentUser = data.user.email;
            appState.currentCity = data.user.city;

            // Update UI with User Info
            const avatarText = getInitials(data.user.full_name || data.user.email);
            document.getElementById("user-avatar").innerText = avatarText;

            // Switch to Home
            switchTab("home");

            // Trigger a location update for their saved city
            document.getElementById("locationSearchInput").value = data.user.city;
            updateLocationFromSearch();

        } else {
            alert("Login Failed: " + data.detail);
        }
    } catch (err) {
        console.error(err);
        alert("Server Error. Is Backend running?");
    }
}

// =======================================
// 12. THEME & SETTINGS LOGIC
// =======================================
function toggleTheme() {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    toggle.classList.toggle('active');
    const isDark = toggle.classList.contains('active');

    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Update charts if they are rendered
    const hasData = pastDataState && pastDataState.data && pastDataState.data.length > 0;
    if (hasData && pastDataState.view === 'charts') {
        renderPastDataCharts(pastDataState.data, pastDataState.mode);
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const toggle = document.getElementById('theme-toggle');

    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (toggle) toggle.classList.add('active');
    } else if (savedTheme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        if (toggle) toggle.classList.remove('active');
    } else {
        // Fallback to system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (toggle) toggle.classList.add('active');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            if (toggle) toggle.classList.remove('active');
        }
    }
}

function toggleSetting(element) {
    element.classList.toggle('active');
}

switchTab("login");
