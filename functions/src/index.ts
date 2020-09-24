import * as functions from "firebase-functions";
import * as puppeteer from "puppeteer";
import * as admin from "firebase-admin";

const serviceAccount = require("./serviceAccountKey.json");
const url = "https://www.avoriaz.com/";
const collection_name = "resorts";

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript

// export const helloWorld = functions.https.onRequest(async (request, response) => {
  export const scrapeAvoriaz = functions.pubsub.schedule("0 9 * * *").timeZone("Europe/London").onRun(async (context) => {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });

    functions.logger.info("Hello logs!", { structuredData: true });

    // Puppeteer setup using 1920x1080 viewport, in a headless instance ie. no UI
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: { width: 1920, height: 1080 },
    });

    // Instantiate a new page in our headless browser
    const page = await browser.newPage();

    // Navigate to the piste information page
    await page.goto(url);
    await page.waitForSelector(".WidgetsBar");
    await page.click(".WidgetsBar-item:nth-child(2) a");
    await page.waitForSelector(".WidgetSlopeItem-percent");
    //@ts-ignore - Not yet in @types/puppeteer
    await page.waitForTimeout(2500);

    // Grab piste information container textContent to return something like
    // vertes  0  / 7 bleues  0  / 25 rouges  0  / 13 noires  0  / 6
    const pisteStr = await page.$eval(".WidgetSlopeItem-datas", (el) => el.textContent); // Map this to remove double spaces, /'s, and convert French to English
    let pistesArr: string[] | undefined = pisteStr
        ?.split(" ")
        .filter((item) => item.length >= 1 && item !== "/")
        .map((item) => Fr2En[item] ?? item);

    // Create output array to map our 1D piste information to 2D
    const pistes2D = [];

    // If pistes is not undefined, i.e. no errors, continue
    if (pistesArr) {
        while (pistesArr.length > 0) {
            pistes2D.push(pistesArr.splice(0, 3));
        }
    }

    // Grab lift information inner text
    const liftsStr = await page.$eval(".WidgetSlope-item:nth-child(2) .WidgetSlopeItem-datas", (el) => el.textContent); // Map into an array of strings, like above
    const liftsArr: string[] | undefined = liftsStr
        ?.replace(/\n/gi, " ")
        .split(" ")
        .filter((item) => item.length > 0 && item !== "/")
        .map((item) => Fr2En[item.toLocaleLowerCase()] ?? item.toLocaleLowerCase());

    const lifts2D = [];

    // If pistes is not undefined, i.e. no errors, continue
    if (liftsArr) {
        while (liftsArr.length > 0) {
            lifts2D.push(liftsArr.splice(0, 3));
        }
    }

    response.send({
        name: "Avoriaz",
        pistes: pistes2D,
        lifts: lifts2D,
    });


    // Create final JSON output of array of objects
    const pistes = pistes2D.map((item) => ({ color: item[0], open: item[1], total: item[2] }));
    const lifts = lifts2D.map((item) => ({type: item[0], open: item[1], total: item[2]}))

    // Add data to firestore
    const db = admin.firestore();
    const avoriazDoc = db.collection(collection_name).doc("avoriaz");

    try {
        await avoriazDoc.set({ name: "Avoriaz", pistes, lifts });
    } catch (error) {
        console.log(error);
        functions.logger.error(error);
        response.sendStatus(500);
    }

    response.sendStatus(200);
    return;
});
/* 
const image = await page.screenshot({path: '1.png'});

  response.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': image.length
  });

  response.end(image); */
type PisteType = {
    color: string;
    open: string;
    total: string;
};

type LiftType = {
    type: string;
    open: string;
    total: string;
};

// @ts-ignore
type ResortDocument = {
    name?: string;
    pistes?: PisteType[];
    lifts?: LiftType[];
};

const Fr2En = {
    vertes: "green",
    bleues: "blue",
    rouges: "red",
    noires: "black",
    "téléphérique": "cable_car",
    "télésièges": "chair_lift",
    "télécabines": "gondola",
    "téléskis": "pull_lift"
} as {
    [key: string]: string;
};
