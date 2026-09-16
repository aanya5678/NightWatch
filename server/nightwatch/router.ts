import { z } from "zod";
import {
  askWhy,
  getSnapshot,
  resetSimulation,
  setHouseholdState,
  simulateScenario,
  triggerAlexaAlert,
} from "./store";
import { publicProcedure, router } from "../_core/trpc";

export const nightwatchRouter = router({
  snapshot: publicProcedure.query(() => getSnapshot()),
  simulate: publicProcedure
    .input(z.object({ scenario: z.enum(["normal", "unusual", "repeated"]) }))
    .mutation(({ input }) => simulateScenario(input.scenario)),
  reset: publicProcedure.mutation(() => resetSimulation()),
  setHouseholdState: publicProcedure
    .input(z.object({ householdState: z.enum(["sleeping", "active"]) }))
    .mutation(({ input }) => setHouseholdState(input.householdState)),
  triggerAlexaAlert: publicProcedure.mutation(() => triggerAlexaAlert()),
  askWhy: publicProcedure
    .input(z.object({ question: z.string().min(1).max(240) }))
    .mutation(({ input }) => askWhy(input.question)),
});
