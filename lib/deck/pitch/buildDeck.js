// Entry point for the brand pitch deck.
//
// The spine is fixed — its length is part of what was approved, so a missing
// prospect Instagram audit swaps slide 2 for a brand portrait rather than
// dropping it and renumbering the deck.
//
// Colour is the only thing that varies between builds: `pickPalette` chooses
// from deck/palettes.js off the brand's own scraped primary, and `makeTheme`
// folds that into the tokens every slide reads. Pass `palette` explicitly to
// override the automatic choice.

import PptxGenJS from "pptxgenjs";
import { offerIncludes } from "../openGreyOffer.js";
import { pickPaletteInfo } from "../pickPalette.js";
import { STAGE_H, STAGE_W, makeTheme } from "./theme.js";
import {
  addAskSlide,
  addBrandPortraitSlide,
  addCaseStudySlide,
  addCoverSlide,
  addHostSlide,
  addHowWeWorkSlide,
  addInfluencerTiersSlide,
  addInstagramSlide,
  addOpportunitySlide,
  addPackageSlide,
  addReachSlide,
  addTrackRecordSlide,
} from "./slides.js";

/**
 * A real prospect audit is only usable once it has a profile on it — a failed
 * fetch still passes an object through from the caller.
 */
function hasUsableIgAudit(igAudit) {
  return !!(igAudit && igAudit.profile && (igAudit.profile.username || igAudit.profile.followers != null));
}

/**
 * @param {object} opts
 * @param {object} opts.brand - the `GET /brand` response.
 * @param {"podcast"|"marketing"|"both"} [opts.offerType]
 * @param {object|null} [opts.igAudit] - `GET /audit/instagram/{username}`.
 * @param {object|null} [opts.contentMatches] - `GET /creator-content-matches`.
 * @param {object} [opts.palette] - override the automatic palette choice.
 * @param {number} [opts.year] - stamped on the cover; defaults to this year.
 * @param {{headline?: string, bookingLink?: string, email?: string, phone?: string}} [opts.contact]
 *   printed on the closing slide, so the deck ends with a way to reply.
 * @returns {PptxGenJS} an in-memory deck; the caller persists it.
 */
export default function buildPitchDeck({
  brand,
  offerType = "both",
  igAudit = null,
  contentMatches = null,
  palette = null,
  year = new Date().getFullYear(),
  contact = null,
}) {
  const chosen = palette ? { palette, reason: "Chosen by hand." } : pickPaletteInfo(brand);
  const theme = makeTheme(chosen.palette);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "OGM_PITCH", width: STAGE_W, height: STAGE_H });
  pptx.layout = "OGM_PITCH";
  pptx.author = "Open Grey Media";
  pptx.company = "Open Grey Media";
  pptx.title = `${brand?.name || "Prospect"} × Open Grey Media`;
  pptx.subject = "Open Grey Media partnership proposal";

  const args = { theme, brand, offerType, igAudit, contentMatches, year, contact };

  addCoverSlide(pptx, args);
  if (hasUsableIgAudit(igAudit)) addInstagramSlide(pptx, args);
  else addBrandPortraitSlide(pptx, args);
  addOpportunitySlide(pptx, args);
  addReachSlide(pptx, args);
  addHostSlide(pptx, args);
  addTrackRecordSlide(pptx, args);
  // Slide 6 proves the work in titles and numbers; this shows four of the reels
  // themselves, each tile opening the real post. Unconditional — the thumbnails
  // are bundled, so it is the one piece of proof no failed scrape can remove.
  addCaseStudySlide(pptx, args);
  // The two halves of the offer. Only what is actually being pitched goes in
  // the file: these used to be printed unconditionally, so every podcast-only
  // deck carried a creator-tier price ladder for a service the prospect had not
  // been offered, and every IM deck explained the podcast's pre-production.
  if (offerIncludes(offerType, "marketing")) addInfluencerTiersSlide(pptx, args);
  addPackageSlide(pptx, args);
  if (offerIncludes(offerType, "podcast")) addHowWeWorkSlide(pptx, args);
  addAskSlide(pptx, args);

  // Surfaced so the deck page can show which palette a build landed on.
  pptx.ogmPalette = chosen;
  return pptx;
}
