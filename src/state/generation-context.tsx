"use client";

import { createContext, useContext, useReducer, type Dispatch } from "react";
import {
  generationReducer,
  initialGeneration,
  type GenerationAction,
} from "./reducer";
import type { Generation } from "./types";

interface GenerationContextValue {
  state: Generation;
  dispatch: Dispatch<GenerationAction>;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

/**
 * The single owner of pipeline state (AD-3). No component holds pipeline state
 * locally; everything flows through this reducer. Client component — useReducer.
 */
export function GenerationProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  /** Seed the reducer with a specific state (tests / future rehydration). */
  initialState?: Generation;
}) {
  const [state, dispatch] = useReducer(
    generationReducer,
    initialState ?? initialGeneration,
  );
  return (
    <GenerationContext.Provider value={{ state, dispatch }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration(): GenerationContextValue {
  const ctx = useContext(GenerationContext);
  if (ctx === null) {
    throw new Error("useGeneration must be used within a GenerationProvider");
  }
  return ctx;
}
