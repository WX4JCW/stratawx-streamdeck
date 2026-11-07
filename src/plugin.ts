import streamDeck from "@elgato/streamdeck";

import {
    AdvisoriesAction,
    AltimeterAction,
    ConditionsAction,
    FreezingLevelAction,
    redrawAll,
    TempCAction,
    TempFAction,
    WeatherDialAction,
    WindAction,
    WindsAloftAction,
} from "./actions.js";
import { strataWx } from "./stratawx.js";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new AltimeterAction());
streamDeck.actions.registerAction(new TempCAction());
streamDeck.actions.registerAction(new TempFAction());
streamDeck.actions.registerAction(new WindAction());
streamDeck.actions.registerAction(new AdvisoriesAction());
streamDeck.actions.registerAction(new ConditionsAction());
streamDeck.actions.registerAction(new FreezingLevelAction());
streamDeck.actions.registerAction(new WindsAloftAction());
streamDeck.actions.registerAction(new WeatherDialAction());

// One feed for every key and dial: each StrataWx answer redraws whatever changed.
strataWx.onChange = redrawAll;

await streamDeck.connect();
