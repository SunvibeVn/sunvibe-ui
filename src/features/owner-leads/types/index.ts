import type { components } from "@/api/generated/schema";

type Schemas = components["schemas"];

/** A possible duplicate listed on the detail. */
export type DuplicateCandidate = Schemas["DuplicateCandidateResponse"];
/** One page of the staff lead list. */
export type LeadPage = Schemas["LeadPageResponse"];
/** Answer to adding a note: the new history entry and the lead after it. */
export type LeadNoteResult = Schemas["LeadNoteResponse"];
/** Answer to a bulk assignment: one outcome per lead of the request, in request order (no summary, code or name). */
export type AssignLeadsResult = Schemas["AssignLeadsResponse"];
