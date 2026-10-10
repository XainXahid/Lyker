// Sample data for now. When the HiCentral IDX feed is approved, replace this
// with a loader that pulls from the RESO Web API and maps each record into the
// same shape (see README → "Switching to the real MLS feed").
import listings from "../data/listings.js";

export { listings };
export const listingById = new Map(listings.map((l) => [l.id, l]));
