
// Stripe with Xero

const express = require('express')
const session = require('express-session')
const request = require('request')
const { Issuer } = require('openid-client');

const config = require('./config.json')

const client_id = config.CLIENT_ID;
const client_secret = config.CLIENT_SECRET;
const redirectUrl = config.REDIRECT_URL
const scopes = config.SCOPES;

(async () => {
    let inMemoryToken;

    let app = express()

    app.set('port', (5000))
    app.use(express.static(__dirname + '/public'))
    app.use(session({
        secret: 'something crazy',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }
    }));

    const issuer = await Issuer.discover('https://identity.xero.com'); 

    const client = new issuer.Client({
        client_id: client_id,
        client_secret: client_secret
    }); 

    app.get('/', function (req, res) {
        let consentUrl = client.authorizationUrl({
            redirect_uri: redirectUrl,
            scope: scopes,
        }); 
        res.send(`Sign in and connect with Xero using OAuth2! <br><a href="${consentUrl}">Connect to Xero</a>`)
    })

    app.get('/callback', async function (req, res) {

        try {
            client.CLOCK_TOLERANCE = 5; 
            Issuer.defaultHttpOptions = {timeout: 20000};
            const token = await client.authorizationCallback(redirectUrl, req.query) 
            inMemoryToken = token                   
            let accessToken = token.access_token     
            req.session.accessToken = accessToken
            console.log('\nOAuth successful...\n\naccess token: \n' + accessToken + '\n')
            let idToken = token.id_token
            console.log('\id token: \n' + idToken + '\n')
            console.log('\nid token claims: \n' + JSON.stringify(token.claims, null, 2));
            let refreshToken = token.refresh_token
            console.log('\nrefresh token: \n' + refreshToken)
            req.session.save()

           

            let connectionsRequestOptions = {
                url: 'https://api.xero.com/connections',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                auth: {
                    'bearer': req.session.accessToken
                },
                timeout: 10000
            }

            request.get(connectionsRequestOptions, function (error, response, body) {
                if (error) {
                    console.log('error from conenctionsRequest: ' + error)
                }
                let data = JSON.parse(body)
                let tenant = data[0]    
                let tenantId = tenant['tenantId']
                req.session.xeroTenantId = tenantId
                console.log('\nRetrieving connections...\n\ntenantId: \n' + tenantId)
                req.session.save()
            })
        } catch (e) {
            console.log('ERROR: ' + e)
        } finally {
            res.redirect('/home')
        }

    })

    app.get('/home', function (req, res) {
        res.send(`<br><a href="/getOrganisation">Get Xero Organisation</a><br><br><a href="/getInvoices">Get Xero Invoices</a><br><br><a href="/refreshToken">Refresh Xero Access Token</a>`)
    })

    app.get('/getOrganisation', async function (req, res) {
        let organisationRequestOptions = {
            url: 'https://api.xero.com/api.xro/2.0/organisation',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'xero-tenant-id': req.session.xeroTenantId
            },
            auth: {
                'bearer': req.session.accessToken
            }
        }

        request.get(organisationRequestOptions, function (error, response, body) {
            if (error) {
                console.log('error from organisationRequest: ' + error)
            }
            console.log('body: ' + body)
            res.redirect('/home')
        })
    })

    app.get('/getInvoices', async function (req, res) {
        let invoicesRequestOptions = {
            url: 'https://api.xero.com/api.xro/2.0/invoices',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'xero-tenant-id': req.session.xeroTenantId
            },
            auth: {
                'bearer': req.session.accessToken
            }
        }

        request.get(invoicesRequestOptions, function (error, response, body) {
            if (error) {
                console.log('error from invoicesRequest: ' + error)
            }

            console.log('body: ' + body)
            res.redirect('/home')
        })
    })

    app.get('/refreshToken', async function (req, res) {
        try {
            client.CLOCK_TOLERANCE = 5; 
            Issuer.defaultHttpOptions = {timeout: 20000};
            let newToken = await client.refresh(inMemoryToken.refresh_token);      
            req.session.accessToken = newToken.access_token     
            req.session.save()                                  
            inMemoryToken = newToken
            console.log('\nRefresh successful...\n\nnew access token: \n' + newToken.access_token + '\n')
            console.log('new refresh token: \n' + newToken.refresh_token)
        } catch (e) {
            console.log('refreshToken error: ' + e)
        } finally {
            res.redirect('/home')
        }
    })

    app.listen(app.get('port'), function () {
        console.log("http://localhost:" + app.get('port'))
    });
})();