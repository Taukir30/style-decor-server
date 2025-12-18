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

//middleware for token verification
const verifyFBToken = async (req, res, next) => {
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
        const userCollection = db.collection('users');
        const serviceCollection = db.collection('services');
        const coverageCollection = db.collection('coverage');
        const bookingCollection = db.collection('booking');
        const paymentCollection = db.collection('payments');
        const decoratorCollection = db.collection('decorators');
        const categoryCollection = db.collection('categories');

        //user related apis
        //create
        app.post('/users', async (req, res) => {
            const user = req.body;
            user.role = 'user';
            user.createdAt = new Date();
            const email = user.email;
            const userExists = await userCollection.findOne({ email });

            if (userExists) {
                return res.send({ message: 'user exists' })
            }

            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        //get user
        app.get('/users', verifyFBToken, async (req, res) => {
            const cursor = userCollection.find();
            const result = await cursor.toArray();
            res.send(result);
        })

        //user admin role toggle
        app.patch('/users/:id', verifyFBToken, async (req, res) => {
            const id = req.params.id;
            const roleInfo = req.body;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: roleInfo.role
                }
            }
            const result = await userCollection.updateOne(query, updatedDoc)
            res.send(result);
        })

        //get single user
        app.get('/users/:id', async (req, res) => {

        })

        //get user role
        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await userCollection.findOne(query);
            res.send({ role: user?.role || 'user' })
        })


        //category APIs----------------
        //create
        app.post('/addcategory', async (req, res) => {
            const newCategory = req.body;
            const result = await categoryCollection.insertOne(newCategory);
            res.send(result);
        })

        //all categorys
        app.get('/allcategory', async (req, res) => {

            const cursor = categoryCollection.find().sort({ created_at: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })

        //delete
        app.delete('/category/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await categoryCollection.deleteOne(query);
            res.send(result);
        })


        //service APIs----------
        //create
        app.post('/addservice', async (req, res) => {
            const newService = req.body;
            const result = await serviceCollection.insertOne(newService);
            res.send(result);
        })

        //read api all services
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

        //delete
        app.delete('/services/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await serviceCollection.deleteOne(query);
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
            const { email, status } = req.query;
            const query = {};

            if (email) {
                query.email = email;
            }

            if (status) {
                query.status = status;
            }

            const cursor = bookingCollection.find(query).sort({ created_at: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })

        //booking by decorator
        app.get('/booking/decorator', async (req, res) => {
            const { decoratorEmail, status } = req.query;
            const query = {};
            if (decoratorEmail) {
                query.decoratorEmail = decoratorEmail
            }
            if (status) {
                // query.status = {$in: ['assigned', 'planning phase', 'materials prepared', 'on the way to venue', 'setup in progress']}
                query.status = { $nin: ['completed'] }
            }

            const cursor = bookingCollection.find(query)
            const result = await cursor.toArray()
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

        //edit booking for assign decorator
        app.patch('/booking/:id', async (req, res) => {
            const { decoratorId, decoratorEmail, decoratorName } = req.body;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const updatedDoc = {
                $set: {
                    status: 'assigned',
                    decoratorId: decoratorId,
                    decoratorName: decoratorName,
                    decoratorEmail: decoratorEmail
                }
            }

            const result = await bookingCollection.updateOne(query, updatedDoc)     //update booking collection

            //update decorator information
            const decoratorQuery = { _id: new ObjectId(decoratorId) };
            const decoratorUpdatedDoc = {
                $set: {
                    workStatus: 'in_project'
                }
            }
            const decoratorResult = await decoratorCollection.updateOne(decoratorQuery, decoratorUpdatedDoc);

            res.send(decoratorResult);
        })

        //status update api
        app.patch('/booking/:id/status', async (req, res) => {
            const { status, decoratorId } = req.body;
            const query = { _id: new ObjectId(req.params.id) };
            const updatedDoc = {
                $set: {
                    status: status,
                    updatedAt: new Date()
                }
            }

            if (status === 'completed') {
                //update decorator information
                const decoratorQuery = { _id: new ObjectId(decoratorId) };
                const decoratorUpdatedDoc = {
                    $set: {
                        workStatus: 'available'
                    }
                }
                const decoratorResult = await decoratorCollection.updateOne(decoratorQuery, decoratorUpdatedDoc);
            }

            const result = await bookingCollection.updateOne(query, updatedDoc)
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
                return res.send({ message: 'already exists', transactionId, trackingId: paymentExist.trackingId });
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


        //payment read all or by email
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
            const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
            const result = await cursor.toArray();
            res.send(result);
        })


        //decoratior related apis--------------
        //create
        app.post('/decorators', async (req, res) => {
            const decorator = req.body;
            decorator.status = 'pending';
            decorator.createdAt = new Date();
            // decorator.isAvailable = true;

            const result = await decoratorCollection.insertOne(decorator);
            res.send(result)
        })

        //read all or avaiable decorators
        app.get('/alldecorators', async (req, res) => {
            const { status, location, workStatus } = req.query;
            const query = {}

            if (status) {
                query.status = status;
            }
            if (location) {
                query.location = location;
            }
            if (workStatus) {
                query.workStatus = workStatus;
            }

            const cursor = decoratorCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        //update decorators
        app.patch('/decorators/:id', verifyFBToken, async (req, res) => {
            const status = req.body.status;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: status,
                    workStatus: 'available'
                }
            }

            const result = await decoratorCollection.updateOne(query, updatedDoc);

            if (status === 'approved') {
                const email = req.body.email;
                const userQuery = { email };
                const updateUser = {
                    $set: {
                        role: 'decorator'
                    }
                }
                const userResult = await userCollection.updateOne(userQuery, updateUser);
            }
            res.send(result);
        })

        //delete decorators
        app.delete('/decorators/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };

            const result = await decoratorCollection.deleteOne(query);
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
