import express    = require ("express");         // routing
import session    = require ('express-session'); // sessions
import cryptoJS   = require ("crypto-js");       // crypting

import {NextFunction, Request, Response} from "express";

import debug = require ("debug");
import {IDebugger} from "debug";
let debugLogin : IDebugger = debug("login");  // debugging login
let debugHTTP  : IDebugger = debug("http");   // debugging http


/*****************************************************************************
 ***  Create server with handler function and start it                       *
 *****************************************************************************/
let router = express();
router.listen(8080, "localhost", function () {
    console.log("started server");
    console.log("-------------------------------------------------------------");
});


/*****************************************************************************
 ***  Middleware Routers for Parsing, Session- and Rights-Management         *
 *****************************************************************************/

//--- session management -----------------------------------------------------
router.use( session( {
    // save session even if not modified
    resave            : true,
    // save session even if not used
    saveUninitialized : true,
    // forces cookie set on every response needed to set expiration (maxAge)
    rolling           : true,
    // name of the cookie set is set by the server
    name              : "mySessionCookie",
    // encrypt session-id in cookie using "secret" as modifier
    secret            : "geheim",
    // set some cookie-attributes. Here expiration-date (offset in ms)
    cookie            : { maxAge: 3 * 60 * 1000 },
} ) );


// Add headers
router.use(function (req, res, next) {

    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', "*");

    // Request methods you wish to allow
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

    // Request headers you wish to allow
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    res.setHeader('Access-Control-Allow-Credentials', "true");

    // Pass to next layer of middleware
    next();
});

//--- parsing json -----------------------------------------------------------
router.use( express.json() );




/*****************************************************************************
 *** sendData                                                                *
 *** Function that is called by each route to send data                      *
 *** gets userList from database , constructs and send response              *
 *****************************************************************************/
function sendData(status : number, res : Response,
                  message: string) {
    /*
      status   : HTTP response state            (provided in any case)
      res      : Response object for responding (provided in any case)
      message  : Message to be returned         (provided in any case)
    */

    //--- Variable declaration with detailed type of response -------------------
    let response : { message  : string;};
    response = { message  : message};
    res.status(status);  // set HTTP response state, provided as parameter
    res.json(response);  // send HTTP-response
    debugHTTP("\n-----------------------------------------------------------");
    debugHTTP( JSON.stringify(response,null,2) + "\n");
}


function checkRights(req: Request, res: Response) : boolean{
    let response : { message  : string;};
    if (!req.session.rights) {
        response = { message  : "No session: Please log in"};
        res.status(401);     // set HTTP response state
        res.json(response);  // send HTTP-response
        debugHTTP ("\n-----------------------------------------------------------");
        debugHTTP ( JSON.stringify(response,null,2) + "\n");
        return false;
    }

    return true;
}

function getUnicId(url) : string{
    let r = Math.random().toString(36).substring(7);
    return "" + cryptoJS.AES.encrypt(url, r);
}


router.use(function (req:Request, res:Response, next:NextFunction) {
    let message  : string = ""; // To be set
    let username : string = "";
    if (req.sessionID.toString() !== "" ||
        req.cookies.toString() !== null) { //--- Check if session still exists -----------------
        next();   // call subsequent routers (only if logged in)
    } else {
        message = "Session expired: Please log in again";
        res.status(401);
        res.json( { "message" : message, "username" : username } )
    }
});



router.post("/convert",function (req: Request, res: Response) {
    let url : string = (req.body.url ? req.body.url : "").trim();
    let format : string = (req.body.format ? req.body.format : "").trim();
    let message  : string = "";
    let status   : number = 500; // Initial HTTP response status
    var regexURL = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/i;

    //--- check Rights -> RETURN if not sufficient ------------------------------
    //if (!checkRights(req,res,)) { return; }

    var patt = new RegExp(regexURL);

    //-- ok -> convert logic-----------------------------------
    if ((url !== "") && (format !== "") && patt.test(url)) {
        console.log("amk");
    }
    //--- nok -------------------------------------------------------------------
    else { // some parameters are not provided
        message = "Bad Request: not all mandatory parameters provided";
        sendData(400, res, message); // send message and all data
    }
});