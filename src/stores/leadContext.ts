import { create } from "zustand";

export type LeadContext = {
  id: string;
  business_name: string;
  owner_name: string | null;
  demo_url: string | null;
  niche: string | null;
  stage: string | null;
};

type LeadContextState = {
  activeLead: LeadContext | null;
  setActiveLead: (lead: LeadContext | null) => void;
};

export const useLeadContextStore = create<LeadContextState>((set) => ({
  activeLead: null,
  setActiveLead: (lead) => set({ activeLead: lead }),
}));

