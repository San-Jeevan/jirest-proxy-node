process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var compression = require('compression');
const express = require('express');
const app = express();
app.use(compression());
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true, limit: 256000 }));
var querystring = require('querystring');
var request = require('request');
var router = express.Router();
var encoding = require('encoding');
var cookieParser = require('cookie-parser');
app.use(cookieParser());
var iconvlite = require('iconv-lite');
var fs = require('fs');
var http = require('http');
var https = require('https');
var zlib = require('zlib');

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", req.headers["access-control-request-headers"]);
    res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    next();
});

class CorsProxyRequest {
    constructor(method, url, protocol, headers, body) {
        this.method = '';
        this.url = '';
        this.protocol = '';
        this.headers = [];
        this.body = '';
    }
}

class CorsProxyResponse {
    constructor(method, url, reqheaders, respheaders, reqbody, respbody, bodySize, protocol, success, message, details) {
        this.method = '';
        this.url = '';
        this.reqheaders = '';
        this.respheaders = '';
        this.reqbody = '';
        this.respbody = '';
        this.bodySize = '';
        this.protocol = '';
        this.success = '';
        this.message = '';
        this.details = [];
    }
}

function StringToEncoding(charset) {
    var ctencoding = 'utf-8';
    if (charset.includes('utf-8') || charset.includes('utf-32') || charset.includes('utf-7'))
        ctencoding = 'utf-8';
    if (charset.includes('us-ascii'))
        ctencoding = 'ascii';

    return ctencoding;
}

function ProxyOther(req, res) {
    try {
        // to config the request SSL and cookiehandler , maxresponse_size , encoding
        var requesturl = encodeURI(req.body.url);
        var headers = new Object();
        var isZipped = false;
        //var cookieValue = 
        // main
        if (req.body.headers != null) {
            for (i = 0; i < req.body.headers.length; i++) {
                if (!req.body.headers[i].includes(':'))
                    continue;
                var currentHeader = req.body.headers[i].split(":");
                var headerkey = currentHeader[0];
                var headervalue = currentHeader[1];
                headervalue = headervalue.trim();
                headers[headerkey] = headervalue;

                var ctencoding = 'utf-8';
                // Content-type
                if (headerkey.toLowerCase() == 'content-type') {
                    if (req.method.toLowerCase() == 'get') {
                        continue;
                    }

                    if (headervalue.toLowerCase().includes('charset')) {
                        ctencoding = StringToEncoding(headervalue);
                    }

                    if (headervalue.includes(';')) {
                        headervalue = headervalue.replace(' ', '').split(';')[0];
                    }

                    // to add to a content    
                    continue;
                }

                //COOKIES
                if (headerkey.toLowerCase() == 'cookie') {
                    var cookies = headervalue.replace(' ', '').split(';');
                    cookies.forEach(function (cookie) {
                        var name = cookie.split('=')[0];
                        var value = cookie.split('=')[1];
                        res.cookie(name, value);
                    });
                }

                if (headerkey.toLowerCase() == 'accept-encoding') {
                    if (headervalue.toLowerCase().includes('gzip') || headervalue.toLowerCase().includes('deflate'))
                        isZipped = true;
                }
            }
        }

        if (isZipped)
            ctencoding = null;

        var options = {
            url: req.body.url,
            method: req.body.method,
            headers: headers,
            encoding: ctencoding,
            body: req.body.body
        };

        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var respbody = body;

                // If response is gzip, unzip first
                var encoding = response.headers['content-encoding']
                if (encoding && encoding.indexOf('gzip') >= 0) {
                    zlib.gunzip(body, function (err, dezipped) {
                        if (dezipped != undefined || dezipped != null) {
                            respbody = dezipped.toString();
                            sendResponse(req, response, respbody, res);
                        }
                        else {
                            sendResponse(req, response, respbody, res);
                        }

                    });

                } else if (encoding && encoding.indexOf('deflate') >= 0) {
                    zlib.inflate(body, function (err, deflated) {
                        if (deflated != undefined || deflated != null) {
                            respbody = deflated.toString();
                            sendResponse(req, response, respbody, res);
                        }
                        else
                            sendResponse(req, response, respbody, res);

                    });
                }
                else {
                    sendResponse(req, response, respbody, res);
                }
            }
            else {

                var err_content = '';
                if (error != null)
                    err_content = error.message;
                var hostmismatch = false;
                var hostheader = req.body.headers['Host'];
                if (hostheader != null) {
                    var headervalue = hostheader.trim();
                    if (!req.body.url.includes(headervalue.replace(' ', ''))) {
                        hostmismatch = true;
                    }
                }

                var corsProxyResponse = new CorsProxyResponse();
                corsProxyResponse.details = err_content;
                corsProxyResponse.message = err_content + (hostmismatch ? " " + "It appears your host header is not the same as request url. This may be the cause? Try removing it completely or set it to be correct." : "");
                corsProxyResponse.success = false;
                corsProxyResponse.url = req.body.url;
                corsProxyResponse.method = req.body.method;
                corsProxyResponse.reqbody = req.body.body;
                corsProxyResponse.reqheaders = req.body.headers == null ? '' : req.body.headers.join('\r\n');
                corsProxyResponse.protocol = 'HTTP/1.1';
                corsProxyResponse.bodySize = '0';

                res.status(500).send(corsProxyResponse);
            }
        })

    }
    catch (ex) {
        var hostmismatch = false;
        var err_content = '';
        if (error != null)
            err_content = ex.message;

        var corsProxyResponse = new CorsProxyResponse();
        corsProxyResponse.details = err_content;
        corsProxyResponse.message = err_content + (hostmismatch ? " " + "It appears your host header is not the same as request url. This may be the cause? Try removing it completely or set it to be correct." : "");
        corsProxyResponse.success = false;
        corsProxyResponse.url = req.body.url;
        corsProxyResponse.method = req.body.method;
        corsProxyResponse.reqbody = req.body.body;
        corsProxyResponse.reqheaders = req.body.headers == null ? '' : req.body.headers.join('\r\n');
        corsProxyResponse.protocol = 'HTTP/1.1';
        corsProxyResponse.bodySize = '0';

        res.status(500).send(corsProxyResponse);
    }

}

app.post('/api/proxy/:CorsProxy', function (req, res) {
    var routePass = req.params.CorsProxy;

    if (routePass = 'corsBypass') {
        console.log('corsBypass');
        ProxyOther(req, res);
    }
    else {
        console.log('corsproxy');
        ProxyOther(req, res);
    }
});



var privateKey = fs.readFileSync('./key/server.key', 'utf8');
var certificate = fs.readFileSync('./key/server.crt', 'utf8');
var credentials = { key: privateKey, cert: certificate };
var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

httpServer.listen(62050, function () {
    console.log('http  listening on port 62050!');
});

httpsServer.listen(62053, function () {
    console.log('https  listening on port 62053!');
});


function sendResponse(req, response, respbody, res) {
    var respheaders = "";
    Object.keys(response.headers).forEach(function (key, index) {
        respheaders = respheaders.concat(key + ": " + response.headers[key] + "\r\n");
    });

    var corsProxyResponse = new CorsProxyResponse();
    corsProxyResponse.success = true;
    corsProxyResponse.details = [];
    corsProxyResponse.message = '';
    corsProxyResponse.url = req.body.url;
    corsProxyResponse.method = req.body.method;
    corsProxyResponse.reqbody = req.body.body;
    corsProxyResponse.reqheaders = req.body.headers.join("\r\n");
    corsProxyResponse.respbody = respbody;
    corsProxyResponse.respheaders = respheaders;
    var ctlength = '';
    if (response.headers['content-length'] == undefined || response.headers['content-length'] == undefined == null) {
        ctlength = response.body.length.toString();
    }
    else
        ctlength = parseInt(response.headers['content-length']).toString();

    if (ctlength.length > 3) {
        var prefix = ctlength.substring(0, ctlength.length - 3);
        var suffix = ctlength.substring(ctlength.length - 3);
        corsProxyResponse.bodySize = prefix + ' ' + suffix;
    }
    else
        corsProxyResponse.bodySize = ' ' + ctlength;
    corsProxyResponse.protocol = 'HTTP/1.1';

    res.send(corsProxyResponse);
}
