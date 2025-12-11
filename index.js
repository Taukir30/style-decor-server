const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIP_SECRET);

const port = process.env.PORT || 3000

const admin = require("firebase-admin");

// const serviceAccount = require("./style-decore-firebase-adminsdk.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


//generate tracking id function
function generateTrackingId() {
    const prefix = "TRK"; // customize for your project
    const timestamp = Date.now();  // milliseconds since 1970
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();

    return `${prefix}-${timestamp}-${randomPart}`;
}

//middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {                           //token verification middleware
    // console.log('header in the middleware', req.headers.authorization)
    const token = req.headers.authorization;

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }

    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        console.log('decoded from token', decoded);
        req.decoded_email = decoded.email;
        next();

    }
    catch (err) {
        return res.status(401).send({ message: 'unauthorized access' });
    }

}

//mongodb connection uri
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@ta.qolps9k.mongodb.net/?appName=TA`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        //getting the database
        const db = client.db('style_decor_db');

        //getting the table/collection
        const serviceCollection = db.collection('services');
        const coverageCollection = db.collection('coverage');
        const bookingCollection = db.collection('booking');
        const paymentCollection = db.collection('payments');


        //service APIs----------
        //create
        app.post('/addservice', async (req, res) => {
            const newService = req.body;
            const result = await serviceCollection.insertOne(newService);
            res.send(result);
        })

        //read api all services or services by email
        app.get('/allservices', async (req, res) => {

            const cursor = serviceCollection.find().sort({ created_at: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })

        //popular services
        app.get('/popularservices', async (req, res) => {
            const query = {};
            query.isPopular = true;
            const cursor = serviceCollection.find(query).sort({ created_at: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })

        //services details read api
        app.get('/service/:id', async (req, res) => {
            const id = req.params.id;

            if (!/^[a-fA-F0-9]{24}$/.test(id)) {
                res.send({})
            }

            const query = { _id: new ObjectId(id) };
            // const query = { _id: id };
            const result = await serviceCollection.findOne(query);
            res.send(result);
        })


        //Booking APIs------------------
        //create
        app.post('/addbooking', async (req, res) => {
            const newBooking = req.body;
            const result = await bookingCollection.insertOne(newBooking);
            res.send(result);
        })

        //all bookings or bookings by email
        app.get('/allbookings', async (req, res) => {
            const email = req.query.email;
            const query = {};
            if (email) {
                query.email = email;
            }
            const cursor = bookingCollection.find(query).sort({ created_at: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })

        //booking details read api
        app.get('/booking/:id', async (req, res) => {
            const id = req.params.id;

            if (!/^[a-fA-F0-9]{24}$/.test(id)) {
                res.send({})
            }

            const query = { _id: new ObjectId(id) };
            const result = await bookingCollection.findOne(query);
            res.send(result);
        })

        //delete api
        app.delete('/deletebooking/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await bookingCollection.deleteOne(query);
            res.send(result);
        })


        //Coverage area APIs--------------
        //read
        app.get('/coverage', async (req, res) => {

            const cursor = coverageCollection.find().sort({ created_at: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })

        //create
        app.post('/addcoverage', async (req, res) => {
            const newCoverageArea = req.body;
            const result = await coverageCollection.insertOne(newCoverageArea);
            res.send(result);
        })


        //payment related apis-----------------
        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.price) * 100;
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'USD',
                            unit_amount: amount,
                            product_data: {
                                name: paymentInfo.serviceName
                            }
                        },
                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.customerEmail,
                mode: 'payment',
                metadata: {
                    bookingId: paymentInfo.bookingId,
                    serviceName: paymentInfo.serviceName
                },
                success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
            })

            console.log(session);
            res.send({ url: session.url })
        })

        //payment success check api
        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            const transactionId = session.payment_intent;
            const query = { transactionId: transactionId }

            const paymentExist = await paymentCollection.findOne(query);

            if (paymentExist) {
                return res.send({ message: 'already exists', transactionId });
            }

            const trackingId = generateTrackingId();
            console.log(trackingId);

            if (session.payment_status === 'paid') {
                const id = session.metadata.bookingId;
                const query = { _id: new ObjectId(id) }
                const update = {
                    $set: {
                        paymentStatus: 'paid',
                        trackingId: trackingId
                    }
                }

                const result = await bookingCollection.updateOne(query, update);

                const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    bookingId: session.metadata.bookingId,
                    serviceName: session.metadata.serviceName,
                    transactionId: session.payment_intent,
                    paymentStatus: session.payment_status,
                    paidAt: new Date(),
                    trackingId: trackingId
                }

                if (session.payment_status == 'paid') {
                    const resultPayment = await paymentCollection.insertOne(payment)

                    res.send({
                        success: true,
                        modifyBooking: result,
                        trackingId: trackingId,
                        transactionId: session.payment_intent,
                        paymentInfo: resultPayment
                    });
                }

            }

            // res.send({ success: true })
        })


        //payment read all by email
        app.get('/payments', verifyFBToken, async (req, res) => {
            const email = req.query.email;
            const query = {}

            // console.log('headers', req.headers)

            if (email) {
                query.customerEmail = email;

                //verifying token email
                if (email !== req.decoded_email) {
                    return res.status(403).send({ message: 'forbidden access' });
                }
            }
            const cursor = paymentCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })






        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Style Decor server running!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
