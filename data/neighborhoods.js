// Neighborhood info shown on each home's profile. School names are public
// schools in or near each area; ratings come from GreatSchools via a link,
// since their ratings can't be copied without a data license. Assignments
// follow Hawai‘i DOE boundaries, which buyers should confirm by address.
export default {
  "Waikīkī": {
    about: "Beach days, Kapi‘olani Park and Diamond Head hikes, all a short walk away. Busy and walkable, with a lot of visitors.",
    schools: ["Waikīkī Elementary", "Jefferson Elementary", "Washington Middle", "McKinley High"],
    nearby: ["Kūhiō Beach", "Kapi‘olani Park", "Diamond Head", "Honolulu Zoo"],
  },
  "Kaka‘ako": {
    about: "Newer towers, murals, breweries and the Saturday farmers market, between downtown and Ala Moana.",
    schools: ["Ka‘ahumanu Elementary", "Central Middle", "McKinley High"],
    nearby: ["Ala Moana Beach Park", "Kaka‘ako Waterfront Park", "Ala Moana Center", "Ward Village"],
  },
  "Mānoa": {
    about: "A green, rainy valley with older homes, big trees and the University of Hawai‘i campus.",
    schools: ["Noelani Elementary", "Mānoa Elementary", "Stevenson Middle", "Roosevelt High"],
    nearby: ["UH Mānoa", "Mānoa Falls Trail", "Lyon Arboretum", "Mānoa Marketplace"],
  },
  "Kaimukī": {
    about: "A neighborhood main street along Wai‘alae Ave with bakeries, cafes and restaurants, close to Diamond Head.",
    schools: ["Liholiho Elementary", "Hōkūlani Elementary", "Kaimukī Middle", "Kaimukī High"],
    nearby: ["Wai‘alae Ave shops", "Diamond Head", "Kapahulu Ave", "Kapi‘olani Community College"],
  },
  "Kāhala": {
    about: "Quiet streets and large lots near the beach and Kāhala Mall, just past Diamond Head.",
    schools: ["Kāhala Elementary", "Kaimukī Middle", "Kalani High"],
    nearby: ["Kāhala Beach", "Kāhala Mall", "Wai‘alae Beach Park", "Diamond Head"],
  },
  "Kailua": {
    about: "Windward town with famous beaches, a walkable center and a slower pace, about 25 minutes from town.",
    schools: ["Kailua Elementary", "Aikahi Elementary", "Kailua Intermediate", "Kailua High", "Kalāheo High"],
    nearby: ["Kailua Beach Park", "Lanikai Beach", "Kailua Town", "Kawainui Marsh"],
  },
  "Hawai‘i Kai": {
    about: "Marina living on the east side, near Hanauma Bay, Koko Head and plenty of shopping.",
    schools: ["Kamiloiki Elementary", "Hahaione Elementary", "Koko Head Elementary", "Niu Valley Middle", "Kaiser High"],
    nearby: ["Koko Marina", "Hanauma Bay", "Koko Head Trail", "Maunalua Bay"],
  },
  "Kāne‘ohe": {
    about: "Windward and green, with Ko‘olau mountain views, the bay and a quieter pace.",
    schools: ["Ben Parker Elementary", "Kāne‘ohe Elementary", "King Intermediate", "Castle High"],
    nearby: ["Ho‘omaluhia Botanical Garden", "Windward Mall", "Kāne‘ohe Bay", "He‘eia State Park"],
  },
  "‘Ewa Beach": {
    about: "Newer neighborhoods on the west side with more space for the money, near Kapolei.",
    schools: ["Holomua Elementary", "‘Ewa Beach Elementary", "Ilima Intermediate", "Campbell High"],
    nearby: ["‘Ewa Beach Park", "Ka Makana Ali‘i", "Ko Olina", "Hoakalei Country Club"],
  },
};

// Destinations buyers usually check a commute to. Opened in Google Maps.
export const COMMUTES = [
  ["Downtown Honolulu", "Downtown Honolulu, HI"],
  ["Pearl Harbor (JBPHH)", "Joint Base Pearl Harbor-Hickam, HI"],
  ["UH Mānoa", "University of Hawaii at Manoa, Honolulu, HI"],
  ["Airport", "Daniel K. Inouye International Airport, Honolulu, HI"],
];
