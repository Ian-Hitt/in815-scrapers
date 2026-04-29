import { runSnapScraper } from "./snap.js";

runSnapScraper({
  schoolName: "Auburn High School",
  organizationId: "RockfordAuburn",
  homeAddress: { address: "5110 Auburn St", city: "Rockford", state: "IL", zip: "61101" },
  outputFile: "../data/auburn.csv",
}).catch(console.error);
