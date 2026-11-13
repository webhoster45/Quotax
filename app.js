require('dotenv').config();
const express=require('express');
const app=express();
const mongoose=require('mongoose');
const path=require('path');
const cors=require('cors');
const {createClient}=require('redis');
const jwt=require('jsonwebtoken');
const MONGODB_URL=process.env.MONGODB_URL;
const JWT_SECRET=process.env.JWT_SECRET;
const PORT=process.env.PORT || 5000;
const Schema=mongoose.Schema;
const bcrypt=require('bcrypt')

const allowedevents=new Set(['api_count','total_requests_per_key']);

const keys={
  apicount:'API Count:',
  totalrequests:'Total Requests Per Key:'
}

const smallletters=['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
const largeletters=['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
const numbers=[0,1,2,3,4,5,6,7,8,9,0];


const plans=new Set(['basic','premium','pro'])

const userschema=new Schema({
  username:{type:String,required:true},
  password:{type:String,required:true},
  email:{type:String,required:true},
  totalapis:{type:Number,default:0},
  plan:{type:String,default:"Basic"}
},{timestamps:true})

const apiSchema=new Schema({
  userid:{type:String,required:true},
  api:{type:String,required:true},
  limit:{type:String,required:true},
  plan:{type:String,required:true},
  expiry:{type:Number,required:true}
},{timestamps:true})

const User=mongoose.model('User',userschema);
const Api=mongoose.model('Api',apiSchema)



app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}))

function daykey(){
  return newDate().toISOString().split(0,10)
}

function activitykey(){
  return `activity:${daykey()}`
}

const redisopt={
url:process.env.REDIS_CLI,
socket:{
    reconnectStrategy:(retries)=> Math.min(retries*250,3000)
}
}

const redispublisher=createClient(redisopt);
const redissubscriber=createClient(redisopt);

for (const client of [redispublisher, redissubscriber]){
    client.on('error',(err)=>console.log("REDIS CLIENT ERROR",err))
}


async function claimevent(eventid,username){
  if(!eventid) return null;
  if(eventid.length>200){
     const error=new Error("Idempotency-key is too long");
     error.status=400;
     console.log("Error:",error)
     throw error;
  }

  const key=`event:${eventid}:${username}`;
  const claimed=await redispublisher.set(key,'processing',{NX:true,EX:86400})
  if(claimed !== 'OK'){
    const error=new Error("Event already processed");
    error.status=409;
    throw error;
  }
  return key;
}

async function recordmetrics({eventtype,username,apikey,userid}){
  const activity=`${username} ${eventtype} ${apikey} ${userid}`;
  await redispublisher.incr(`activity:${daykey()}`,1);
  if(eventtype==='api_count'){
    await redispublisher.incr(`${keys.apicount}:${apikey}`,1);
  }else if(eventtype==='total_requests_per_key'){
    await redispublisher.incr(`${keys.totalrequests}:${apikey}`,1);
  }
}


function requireredis(req,res,next){
    if (redispublisher.isReady && redissubscriber.isReady) return next()
    return res.status(503).json({message:"Redis is not ready"})
}

async function startapp(){
  // console.log(JWT_SECRET)
  if(!MONGODB_URL|| !JWT_SECRET) return console.log("MONGODB_URL or JWT_SECRET is missing");
  await Promise.all([
    redissubscriber.connect(),
    redispublisher.connect(),
    mongoose.connect(MONGODB_URL).then(()=>console.log("MongoDB connected✅"))
  ])

  await redissubscriber.subscribe('notification',(message)=>{
    console.log("Recieved message", message)
  })

  app.listen(PORT,()=>console.log(`Server running at PORT: ${PORT}`))
}


startapp();


function generateapikey(){
  let apikey='';
  for(let i=0;i<32 ;i++){
      apikey+=numbers[Math.floor(Math.random()*numbers.length)]
      apikey+=largeletters[Math.floor(Math.random()*largeletters.length)]
      apikey+=smallletters[Math.floor(Math.random()*smallletters.length)]
  }
  return apikey
}



async function authmiddleware(req, res, next) {
  try {
    const authheader = req.headers['authorization'];
    if (!authheader) return res.status(403).json({ message: "Authorization header missing" });

    // Match 'bearer ' or 'Bearer ' case-insensitively and extract the token string
    const match = authheader.match(/^bearer\s+(.+)$/i);
    const token = match ? match[1] : authheader;

    console.log("Extracted Token to Verify:", token);

    if (!token) return res.status(403).json({ message: "Token missing from header" });

    // Ensure we are passing the object payload property downstream
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; 
    return next();

  } catch (error) {
    return res.status(401).json({ message: "Auth server Error", error: error.message });
  }
}


async function apimiddleware(req,res,next){
try {
  const apikey=req.headers['x-api-key']
  const existingindb=await Api.findOne({apikey});
  const remainingms=await redispublisher.pTTL(`API:${apikey}`)
  if(!apikey) return res.status(401).json({message:"API key is missing"});
  if(!Api) return res.status(401).json({message:"API key doesn't exist"})
  if(apikey==-2)return res.status(401).json({message:"Key Expired"})
  req.apikey=apikey;
  return next()
} catch (error) {
  console.log("Error: ",error)
  return res.status(500).json({message:"API server Error"})
}
}



app.post('/registerorlogin',requireredis,async (req,res)=>{
  try {
    let token=null
    const {username,email,password}=req.body;
    if(!username||!email||!password) return res.status(400).json({message:"Missing Parameters"});
    const existinguser=await User.findOne({username});
    if(existinguser){
      const exemail=existinguser.email
      const passwordmatch=await bcrypt.compare(password,existinguser.password)
      if(exemail!=email) return res.status(403).json({message:"Invalid credentials"})
      if(!passwordmatch) return res.status(403).json({message:"Invalid credentials"})
      
      token=jwt.sign({username},JWT_SECRET)
      console.log("Generated Token: ",token)
      return res.status(200).json({message:`User: ${username} successfully created`,token})
    }
    // else{
      token=jwt.sign({username},JWT_SECRET)
      const hashedpassword=await bcrypt.hash(password,10)
      await User.create({username,password:hashedpassword,email})
      return res.status(201).json({message:`User: ${username} successfully created successfully`,token})
    // }
  } catch (error) {
    return res.status(200).json({message:"Internal Server Error",error})
  }
})





app.post('/upgradeplan',authmiddleware,requireredis,async (req,res)=>{
    try {
    const {plan,verified}=req.body;
    if(!plan) return res.status(400).json({message:"Invalid credentials"})
    if(!verified) return res.status(401).json({message:"You need to be verified"});
    const username=req.user.username;
    const existinguser=await User.findOne({username});
    if(!existinguser) return res.status(400).json({message:"User doesn't exist"});

    existinguser.plan=plan;
    await existinguser.save()
    return res.status(200).json({message:`Plan updated to ${plan}`})
  } catch (error) {
    return res.status(500).json({message:"Internal Server Error",error})
  }
})


app.post('/generatekey',authmiddleware,requireredis,async(req,res)=>{
  try {
    let apikey=generateapikey();
    const existing=await Api.findOne({existing:apikey});
    const username=req.user.username
    if(existing) apikey=generateapikey();
    console.log('here ');
    const user=await User.findOne({username});

    
    if(!user)  return res.status(400).json({message:"Duplicate: API key exists"});
    const userid=user._id;
    const limit=2;
   
    await redispublisher.set(`API:${apikey}`,86400,{PX:5000})
  //do redis here
    await Api.create({userid,api:apikey,limit,plan:user.plan,expiry:86400})
    return res.status(200).json({message:"API key generated successfully"})

  } catch (error) {
    return res.status(500).json({message:"Internal Server Error",error})
  }
})

//---------------------------------------------UNTESTED------------------------------------------

app.get('/listkeys',authmiddleware,requireredis,async (req,res)=>{
  
    try {
  const existinguser=await User.findOne({username:req.user.username});
   if(!existinguser) return res.status(400).json({message:"User doesn't exist"});
   const userapis=await Api.find({userid:existinguser._id});
   return res.status(200).json({message:"User APIs: ",userapis:userapis||[]})

  } catch (error) {
    return res.status(500).json({message:"Internal Server Error",error})
  }
  

})


app.post('/rotate/:id',authmiddleware,requireredis,async (req,res)=>{
  const id=req.params.id;
  if(!id) return res.status(400).json({message:"No ID"});
  

  const existingkey=await Api.findOne({_id:id});
  if(!existingkey) return res.status(400).json({message:"API key doesn't exist"});
  const newkey=generateapikey();
  existingkey.api=newkey;
  await existingkey.save();
  res.status(200).json({message:"API key rotated successfully"})
})

app.post('/revoke/:id',authmiddleware,requireredis,async (req,res)=>{
  const id=req.params.id;
  if(!id) return res.status(400).json({message:"No ID"});
  

  const existingkey=await Api.findOne({_id:id});
  if(!existingkey) return res.status(400).json({message:"API key doesn't exist"});
  await Api.deleteOne({_id:id})
  res.status(200).json({message:"API key revoked successfully"})
})



app.use((req,res)=>{
  res.status(404).json({message:"Error Page doesn't exist"})
})

