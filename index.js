const express = require('express')
const cors = require('cors');
const app = express();
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const port = process.env.PORT || 3000

//middleware
app.use(express.json());
app.use(cors());

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


    //service APIs
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
