// Real O‘ahu listings shown as photo cards on the Browse tab. Each card credits
// the listing brokerage and HiCentral MLS (IDX rules) and opens the listing on
// Zain's Talk Realty site: https://zain.talkrealty.co/listing-detail/{talkId}?no_reg=1
//
// Copy the details from the Talk Realty listing page. Use the listing's own
// photo URL from that page, and never list another agent's name or phone.
//
// {
//   talkId: "265598949",          // number at the end of the Talk Realty link
//   mode: "buy",                   // "buy" or "rent"
//   price: 799000,                 // monthly rent when mode is "rent"
//   beds: 2, baths: 2, sqft: 950,
//   type: "Condo",                 // Condo, House or Townhouse
//   address: "1777 Ala Moana Blvd #1234",
//   hood: "Waikīkī", city: "Honolulu", zip: "96815",
//   mls: "202612345",              // HiCentral MLS number
//   listOffice: "Listing Brokerage Name",
//   photo: "https://...",          // photo URL from the listing
// },
export default [
  {
    talkId: "265598949", mode: "buy", price: 724500, beds: 3, baths: 2.5, sqft: 1364, type: "House",
    address: "91-546 Makalea St #156", hood: "‘Ewa Beach", city: "Ewa Beach", zip: "96706",
    mls: "202611368", listOffice: "RE/MAX Honolulu",
    photo: "https://d25fhp1qfwqa2h.cloudfront.net/3e61505127846bb584f224d8be27349b,1781205457000_600_auto?phid=19322155621",
  },
];
