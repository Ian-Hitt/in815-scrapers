import { runSnapScraper } from "./snap.js";

runSnapScraper({
  schoolName: "Guilford High School",
  organizationId: "GuilfordHS",
  homeAddress: { address: "5620 Spring Creek Rd", city: "Rockford", state: "IL", zip: "61114" },
  outputFile: "../data/guilford.csv",
}).catch(console.error);
