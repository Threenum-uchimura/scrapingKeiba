/**
/* main.ts
/* ScrapingKeiba - Getting horse racing data. -
**/

"use strict";

//* Constants
const WINDOW_WIDTH: number = 1000; // window width
const WINDOW_HEIGHT: number = 1000; // window height
const DEFAULT_ENCODING: string = 'utf8'; // encoding
const CSV_ENCODING: string = 'Shift_JIS'; // csv encoding
const TARGET_URL: string = 'https://db.netkeiba.com/horse/sire/'; // base url
const BASE_SELECTOR: string = '#contents > div.db_main_deta > table > tbody > tr:nth-child(3) >'; // base
const TURF_SELECTOR: string = `${BASE_SELECTOR} td:nth-child(13) > a`; // turf
const TURF_WIN_SELECTOR: string = `${BASE_SELECTOR} td:nth-child(14) > a`; // turf win
const DIRT_SELECTOR: string = `${BASE_SELECTOR} td:nth-child(15) > a`; // dirt
const DIRT_WIN_SELECTOR: string = `${BASE_SELECTOR} td:nth-child(16) > a`; // dirt win
const TURF_DIST_SELECTOR: string = `${BASE_SELECTOR} td:nth-child(20)`; // turf average distance
const DIRT_DIST_SELECTOR: string = `${BASE_SELECTOR} td:nth-child(21)`; // dirt average distance

//* Modules
import { app, BrowserWindow, dialog } from 'electron'; // electron
import * as fs from 'fs'; // fs
import parse from 'csv-parse/lib/sync'; // csv parser
import stringifySync from 'csv-stringify/lib/sync'; // csv stfingifier
import iconv from 'iconv-lite'; // Ttext converter
import { Scrape } from './class/myScraper'; // scraper
import { FileFilter } from 'electron/main'; // file filter

//* interfaces
// window option
interface windowOption {
  width: number; // window width
  height: number; // window height
  defaultEncoding: string; // default encode
  webPreferences: Object; // node
}

// dialog options
interface dialogOption{
  type: string;
  title: string;
  message: string;
  detail: string;
}

// tmp records
interface parseRecords {
  columns: string[]; // columns
  from_line: number; // line start
}

// csv stringify option
interface csvStringify {
  header: boolean; // header
  columns: csvHeaders[]; // columns
}

// csv dialog option
interface csvDialog {
  properties: any; // file open
  title: string; // header title
  defaultPath: string; // default path
  filters: FileFilter[]; // filter
}

// records
interface csvRecords {
  urls: string; // url
  horse: string; // horse name
}

// csv headers
interface csvHeaders {
  key: string; // key
  header: string; // header
}

//* General variables
// main window
let mainWindow:any = null; 
// result array
let resultArray: Object[][] = []; 
// selector array
const selectorArray: string[] = [TURF_SELECTOR, TURF_WIN_SELECTOR, DIRT_SELECTOR, DIRT_WIN_SELECTOR, TURF_DIST_SELECTOR, DIRT_DIST_SELECTOR]; 
// header array
const headerObjArray: csvHeaders[] = [
  { key: 'a', header: 'horse' }, // horse name
  { key: 'b', header: 'turf' }, // turf ratio
  { key: 'c', header: 'turf win' }, // turf win
  { key: 'd', header: 'dirt' },  // dirt ratio
  { key: 'e', header: 'dirt win' }, // dirt win
  { key: 'f', header: 'turf distanse' }, // turf average distance
  { key: 'g', header: 'turf distanse' } // dirt average distance
];

// scraper
const scraper = new Scrape();

// main
app.on('ready', async () => {
  // window options
  const windowOptions: windowOption = {
    width: WINDOW_WIDTH, // window width
    height: WINDOW_HEIGHT, // window height
    defaultEncoding: DEFAULT_ENCODING, // encoding
    webPreferences: {
      nodeIntegration: false, // node
    }
  }
  // Electron window
  mainWindow = new BrowserWindow(windowOptions);
  // main html
  mainWindow.loadURL('file://' + __dirname + '/index.html');

  // csv file dialog
  const promise: Promise<string> = new Promise((resolve, reject) => {
    // get csv
    getCsvData()
      // success
      .then((res: string[]) => {
        // chosen filename
        const filename:string = res[0];
        // resolved
        resolve(filename);
      })

      // error
      .catch((e: unknown) => {
        // error
        outErrorMsg(e, 1);
        // error message
        showDialog('no file', 'no csv file selected', e, true);
        // rejected
        reject();
        // close window
        mainWindow.close();
    });
  });

  // file reading
  promise.then((name: string) => {
    try {
      // read file
      fs.readFile(name, async(err: any, data: any) => {
        // error
        if (err) throw err;

        // initialize
        await scraper.init();
        console.log(`scraping ${name}..`);

        // decoder
        const str: string = iconv.decode(data, CSV_ENCODING);
        // format date
        const formattedDate: string = (new Date).toISOString().replace(/[^\d]/g, "").slice(0, 14);

        // options
        const recordOptions: parseRecords = {
          columns: ['urls', 'horse'], // column
          from_line: 2, // from line 2
        }
        // csv reading
        const tmpRecords: csvRecords[] = await parse(str, recordOptions);
        // extract first column
        const urls: string[] = await tmpRecords.map(item => item.urls);
        const horses: string[] = await tmpRecords.map(item => item.horse);

        // loop words
        for (let i: number = 0; i < urls.length; i++) {
          // empty array
          let tmpArray: string[] = [];

          // insert horse name
          tmpArray.push(horses[i]);

          // goto page
          await scraper.doGo(TARGET_URL + urls[i]);
          console.log(`goto ${TARGET_URL + urls[i]}`);

          // get data
          for (const sl of selectorArray) {
            try {
              if (await scraper.detectPage('.race_table_01')) {
                // wait for selector
                await scraper.doWaitSelector('.race_table_01', 1000);
                // acquired data
                const scrapedData: string = await scraper.doSingleEval(sl, 'textContent');

                // data exists
                if (scrapedData != '') {
                  tmpArray.push(scrapedData);
                }
                // wait for 100ms
                await scraper.doWaitFor(100);
                // push into final array
                resultArray.push(tmpArray);
                // wait for 100ms
                scraper.doWaitFor(100);
              }

            } catch (e: unknown) {
              console.log(e);
            }
          }
        }

        // stringify option
        const stringifyOptions: csvStringify = {
          header: true, // head mode
          columns: headerObjArray,
        }
        // export csv
        const csvString: string = stringifySync(resultArray, stringifyOptions);

        // output csv file
        fs.writeFileSync(`output/${formattedDate}.csv`, csvString);

        // close window
        mainWindow.close();
      });

    } catch (e: unknown) {
      // error
      outErrorMsg(e, 2);
    }
  });

  // closing
  mainWindow.on('closed', () => {
    // release window
    mainWindow = null;
  });

});

// choose csv data
const getCsvData = (): Promise<string[]>  => {
  return new Promise((resolve, reject) => {
    // options
    const dialogOptions: csvDialog = {
      properties: ['openFile'], // file open
      title: 'choose csv file', // header title
      defaultPath: '.', // default path
      filters: [
        { name: 'csv(Shif-JIS)', extensions: ['csv'] } // filter
      ],
    }
    // show file dialog
    dialog.showOpenDialog(mainWindow, dialogOptions).then((result: any) => {

      // file exists
      if (result.filePaths.length > 0) {
        // resolved
        resolve(result.filePaths);

      // no file
      } else {
        // rejected
        reject(result.canceled);
      }

    }).catch((e: unknown) => {
      // error
      outErrorMsg(e, 3);
      // rejected
      reject();
    });
  });
}

// show dialog
const showDialog = (title: string, message: string, detail: any, flg:boolean = false):void => {
  try {
    // dialog options
    const options:dialogOption = {
      type: '',
      title: title,
      message: message,
      detail: detail.toString(),
    };

    // error or not
    if (flg) {
      options.type = 'error';

    } else {
      options.type = 'info';
    }

    // show dialog
    dialog.showMessageBox(options);

  } catch (e: unknown) {
    // error
    outErrorMsg(e, 4);
  };
}

// outuput error
const outErrorMsg = (e: unknown, no: number):void => {

  // if type is error
  if (e instanceof Error) {
    // error
    console.log(`${no}: ${e.message}`);
  }  
}