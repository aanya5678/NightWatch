import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNightWatchRepository } from "./sqliteRepository";
import { RingEvent } from "./types";

function sampleEvent(): RingEvent {
  return {
    id: "ring-persist-1",
    timestamp: "2026-09-16T03:04:00.000Z",
    deviceId: "ring-front-01",
    deviceName: "Ring Front Entrance",
    location: "front entrance",
    eventType: "motion",
    metadata: { zone: "porch", sensitivity: "high", personDetected: false, sequence: 1 },
    householdState: "sleeping",
  };
}

describe("NightWatch SQLite repository", () => {
  it("survives closing and reopening a file-backed database", () => {
    const directory = mkdtempSync(join(tmpdir(), "nightwatch-") );
    const databasePath = join(directory, "nightwatch.sqlite");
    const event = sampleEvent();
    const firstConnection = createNightWatchRepository(databasePath);

    firstConnection.replaceEvents([event], "sleeping", "unusual");
    firstConnection.close();

    const reopenedConnection = createNightWatchRepository(databasePath);
    expect(reopenedConnection.readState().events).toEqual([event]);
    expect(reopenedConnection.readState().lastScenario).toBe("unusual");
    reopenedConnection.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("round-trips events, metadata, household state, and scenario", () => {
    const repository = createNightWatchRepository(":memory:");
    const event = sampleEvent();

    repository.replaceEvents([event], "sleeping", "unusual");
    const persisted = repository.readState();

    expect(persisted.householdState).toBe("sleeping");
    expect(persisted.lastScenario).toBe("unusual");
    expect(persisted.events).toEqual([event]);
    expect(persisted.alerts).toEqual([]);
    repository.close();
  });

  it("persists household-state updates onto the current events", () => {
    const repository = createNightWatchRepository(":memory:");
    const event = sampleEvent();

    repository.replaceEvents([event], "sleeping", "unusual");
    repository.updateHouseholdState("active");
    const persisted = repository.readState();

    expect(persisted.householdState).toBe("active");
    expect(persisted.events[0]?.householdState).toBe("active");
    expect(persisted.lastScenario).toBe("unusual");
    repository.close();
  });

  it("persists alert delivery and clears the simulation as a unit", () => {
    const repository = createNightWatchRepository(":memory:");
    const event = sampleEvent();
    repository.replaceEvents([event], "sleeping", "unusual");
    repository.addAlert({
      id: "alert-persist-1",
      createdAt: "2026-09-16T03:07:00.000Z",
      status: "pending",
      message: "Test alert",
      reason: "Test reason",
      relatedEventIds: [event.id],
    });

    repository.markLatestAlertDelivered();
    expect(repository.readState().alerts[0]?.status).toBe("delivered");

    repository.clearSimulation();
    expect(repository.readState()).toMatchObject({
      householdState: "sleeping",
      lastScenario: "ready",
      events: [],
      alerts: [],
    });
    repository.close();
  });
});
