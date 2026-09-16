import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { NIGHTWATCH_SQLITE_SCHEMA } from "./sqliteSchema";
import { AlertRecord, HouseholdState, RingEvent, ScenarioName } from "./types";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

export interface PersistedNightWatchState {
  householdState: HouseholdState;
  lastScenario: ScenarioName | "ready";
  events: RingEvent[];
  alerts: AlertRecord[];
}

interface HouseholdStateRow {
  household_state: HouseholdState;
  last_scenario: ScenarioName | "ready";
}

interface RingEventRow {
  id: string;
  timestamp: string;
  device_id: string;
  device_name: string;
  location: string;
  event_type: "motion";
  metadata_json: string;
  household_state: HouseholdState;
}

interface AlertRow {
  id: string;
  created_at: string;
  status: AlertRecord["status"];
  message: string;
  reason: string;
  related_event_ids_json: string;
}

export interface NightWatchRepository {
  readState(): PersistedNightWatchState;
  replaceEvents(events: RingEvent[], householdState: HouseholdState, lastScenario: ScenarioName): void;
  updateHouseholdState(householdState: HouseholdState): void;
  clearSimulation(): void;
  addAlert(alert: AlertRecord): void;
  markLatestAlertDelivered(): void;
  close(): void;
}

export function createNightWatchRepository(databasePath = process.env.NIGHTWATCH_DB_PATH ?? resolve(process.cwd(), "data/nightwatch.sqlite")): NightWatchRepository {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec(NIGHTWATCH_SQLITE_SCHEMA);
  const existingState = database.prepare("SELECT id FROM household_state WHERE id = 1").get() as { id: number } | undefined;
  if (!existingState) {
    database.prepare(
      "INSERT INTO household_state (id, household_state, last_scenario, updated_at) VALUES (1, ?, ?, ?)",
    ).run("sleeping", "ready", new Date().toISOString());
  }

  return {
    readState() {
      const household = database.prepare(
        "SELECT household_state, last_scenario FROM household_state WHERE id = 1",
      ).get() as unknown as HouseholdStateRow;
      const eventRows = database.prepare(
        "SELECT id, timestamp, device_id, device_name, location, event_type, metadata_json, household_state FROM ring_events ORDER BY timestamp DESC",
      ).all() as unknown as RingEventRow[];
      const alertRows = database.prepare(
        "SELECT id, created_at, status, message, reason, related_event_ids_json FROM alert_history ORDER BY created_at DESC",
      ).all() as unknown as AlertRow[];

      return {
        householdState: household.household_state,
        lastScenario: household.last_scenario,
        events: eventRows.map(row => ({
          id: row.id,
          timestamp: row.timestamp,
          deviceId: row.device_id,
          deviceName: row.device_name,
          location: row.location,
          eventType: row.event_type,
          metadata: JSON.parse(row.metadata_json) as RingEvent["metadata"],
          householdState: row.household_state,
        })),
        alerts: alertRows.map(row => ({
          id: row.id,
          createdAt: row.created_at,
          status: row.status,
          message: row.message,
          reason: row.reason,
          relatedEventIds: JSON.parse(row.related_event_ids_json) as string[],
        })),
      };
    },

    replaceEvents(events, householdState, lastScenario) {
      database.exec("BEGIN IMMEDIATE");
      try {
        database.exec("DELETE FROM ring_events");
        database.exec("DELETE FROM alert_history");
        const insertEvent = database.prepare(
          "INSERT INTO ring_events (id, timestamp, device_id, device_name, location, event_type, metadata_json, household_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        );
        for (const event of events) {
          insertEvent.run(
            event.id,
            event.timestamp,
            event.deviceId,
            event.deviceName,
            event.location,
            event.eventType,
            JSON.stringify(event.metadata),
            event.householdState,
          );
        }
        database.prepare(
          "UPDATE household_state SET household_state = ?, last_scenario = ?, updated_at = ? WHERE id = 1",
        ).run(householdState, lastScenario, new Date().toISOString());
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    updateHouseholdState(householdState) {
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare("UPDATE ring_events SET household_state = ?").run(householdState);
        database.prepare(
          "UPDATE household_state SET household_state = ?, updated_at = ? WHERE id = 1",
        ).run(householdState, new Date().toISOString());
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    clearSimulation() {
      database.exec("BEGIN IMMEDIATE");
      try {
        database.exec("DELETE FROM ring_events");
        database.exec("DELETE FROM alert_history");
        database.prepare(
          "UPDATE household_state SET household_state = ?, last_scenario = ?, updated_at = ? WHERE id = 1",
        ).run("sleeping", "ready", new Date().toISOString());
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },

    addAlert(alert) {
      database.prepare(
        "INSERT INTO alert_history (id, created_at, status, message, reason, related_event_ids_json) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(alert.id, alert.createdAt, alert.status, alert.message, alert.reason, JSON.stringify(alert.relatedEventIds));
    },

    markLatestAlertDelivered() {
      database.prepare(
        "UPDATE alert_history SET status = 'delivered' WHERE id = (SELECT id FROM alert_history ORDER BY created_at DESC LIMIT 1)",
      ).run();
    },

    close() {
      database.close();
    },
  };
}
