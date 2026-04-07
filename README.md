# Trip Logger

A personal vehicle tracking app for logging trips, fuel fill-ups, service history, and documents — all in one place, privately hosted on your own machine.

## Why This Exists

Owning a vehicle comes with a surprising amount of paperwork and mental overhead: remembering when you last serviced it, how much you're spending on fuel each month, whether your insurance is up to date, and what that trip actually cost you. Most apps that solve this either require a subscription, send your data to the cloud, or are too complex for everyday use.

Trip Logger was built to be simple and self-hosted. Your data stays on your device. There's no account to create, no third-party service involved, and nothing stops working if a company shuts down. It runs as a small web app you can access from your phone or browser, and it's designed to be fast to use — logging a fuel stop should take under 30 seconds.

## What It Tracks

**Trip Logs** — Record journeys with date, distance, purpose (personal/work/other), start/end locations, and notes.

**Fuel Logs** — Log every fill-up with litres, cost, price per litre, and fuel station. The app tracks your fuel efficiency over time so you can spot if something is off with the vehicle.

**Service History** — Keep a record of maintenance: oil changes, tyre rotations, repairs, and anything else done to the vehicle, with dates and costs.

**Insurance** — Log insurance renewals with provider, policy number, premium, and expiry date so you always know when it's due.

**Vehicle Details** — Store make, model, registration, and scanned documents (licence front/back, RC book, insurance card) directly in the app.

## Insights the App Provides

The Statistics tab gives you a running picture of your vehicle's economics:

- **Cost per kilometre** — total fuel + service spend divided by distance driven, so you know the real cost of using the vehicle
- **Average fuel efficiency** — km/L calculated from your fill-up history, with a chart showing how it trends over time
- **Monthly breakdown** — trips taken, distance covered, and fuel spend for each month, filterable by year
- **Trip purpose split** — a pie chart showing how much of your driving is personal vs. work vs. other
- **Fuel price trend** — a chart of what you've paid per litre over time, useful for spotting price spikes or finding cheaper stations
- **This month at a glance** — trips, total distance, fuel cost, and average trip length for the current month, shown at the top of the Statistics tab

There is also a trip cost estimator: enter a planned distance and it calculates the expected fuel cost based on your historical efficiency and average fuel price.

---

## Installation

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed on your machine
- A terminal (macOS/Linux) or PowerShell (Windows)

### Steps

**1. Clone the repository**

```bash
git clone https://github.com/your-username/mileage-logger.git
cd mileage-logger
```

**2. Create your environment file**

```bash
cp .env.example .env
```

Open `.env` and set your values:

```
PIN=your10digitpin
SESSION_SECRET=any-long-random-string
```

The PIN is what you'll use to log in from your browser. There are no usernames.

**3. Start the app**

```bash
docker compose up -d
```

The app will be available at [http://localhost:3001](http://localhost:3001).

**4. Open it on your phone**

If your computer and phone are on the same Wi-Fi network, open `http://<your-computer-ip>:3001` on your phone. You can also add it to your home screen as a web app (iOS: Share → Add to Home Screen).

### Stopping and updating

```bash
# Stop
docker compose down

# Pull latest code and rebuild
git pull
docker compose up -d --build
```

### Data

All data is stored in the `data/` folder inside the project directory:

- `data/trip-logger-db.json` — all your trip, fuel, service, and vehicle data
- `data/uploads/` — scanned document photos
- `data/backups/` — automatic weekly backups created every Sunday

Back up the `data/` folder to keep your records safe. You can also export a JSON backup from within the app at any time via the Statistics tab.

---

## Running Without Docker

If you have Node.js 18+ installed and prefer not to use Docker:

```bash
npm install
PIN=your10digitpin node server.js
```

The app will start on port 3000 by default. Set `PORT=3001` to change it.
