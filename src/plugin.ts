import streamDeck from "@elgato/streamdeck";

import { AdvisoriesAction, AltimeterAction, ConditionsAction, redrawAll, TempCAction, TempFAction, WindAction } from "./actions.js";
import { strataWx } from "./stratawx.js";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new AltimeterAction());
streamDeck.actions.registerAction(new TempCAction());
streamDeck.actions.registerAction(new TempFAction());
streamDeck.actions.registerAction(new WindAction());
streamDeck.actions.registerAction(new AdvisoriesAction());
streamDeck.actions.registerAction(new ConditionsAction());

// One feed for every key: each StrataWx answer redraws whatever changed.
strataWx.onChange = redrawAll;

await streamDeck.connect();
