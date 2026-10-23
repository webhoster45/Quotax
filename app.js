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

const smallletters=['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
const largeletters=['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
const numbers=[0,1,2,3,4,5,6,7,8,9,0];

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
  plan:{type:String,required:true}
},{timestamps:true})

const User=mongoose.model('User',userschema);
const Api=mongoose.model('Api',apiSchema)

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}))

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
    mongoose.connect(MONGODB_URL).then(()=>console.log("MongoDB connected"))
  ])

  await redissubscriber.subscribe('notification',(message)=>{
    console.log("Recieved message", message)
  })

  app.listen(PORT,()=>console.log(`Server running at PORT: ${PORT}`))
}


startapp();


function generateapikey(){
  let apikey='';
  for(let i=0; ;i++){
    if(apikey.length == 18) break;
    else{
      apikey+=numbers[Math.floor(Math.random()*numbers.length)]
      apikey+=largeletters[Math.floor(Math.random()*largeletters.length)]
      apikey+=smallletters[Math.floor(Math.random()*smallletters.length)]
    }
  }
  return apikey
}

async function authmiddleware(req,res,next){
try {
   const authheader=req.headers.authorization;
   if(!authheader) return res.status(403).json({message:"Yoy don't have access"})
   const token=authheader.split("")[1]
  if(!token) return res.status(403).json({message:"Yoy don't have access"});
  jwt.verify(token, JWT_SECRET,(err,decoded)=>{
    if(err) return res.status(403).json({message:"Invalid token"})
     req.user=decoded
  })

  next()

} catch (error) {
  return res.status(500).json({message:"Auth server Error ",error})
}
}

async function apimiddleware(req,res,next){
try {
  const apikey=req.headers['x-api-key']
  if(!apikey) return res.status(401).json({message:"API key is missing"})
  req.apikey=apikey;
  next()
} catch (error) {
  console.log("Error: ",error)
  return res.status(500).json({message:"API server Error"})
}
}


console.log(generateapikey())



app.post('registerorlogin',requireredis,async (req,res)=>{
  try {
    const {username,email,password}=req.body;
    if(!username||!email||!password) return res.status(400).json({message:"Missing Parameters"});
    const existinguser=await User.findOne({username});
    if(existinguser){
      const exemail=existinguser.email
      const passwordmatch=await bcrypt.compare(password,existinguser.password)
      if(exemail!=email) return res.status(403).json({message:"Invalid credentials"})
      if(!passwordmatch) return res.status(403).json({message:"Invalid credentials"})
      
      const token=jwt.sign({username},JWT_SECRET)
      return res.status(200).json({message:`User: ${username} successfully created`},token)
    }
    // else{
      const hashedpassword=await bcrypt.hash(password,10)
      await User.create({username,password:hashedpassword,email})
      return res.status(201).json({message:`User: ${username} successfully created successfully`})
    // }
  } catch (error) {
    return res.status(200).json({message:"Internal Server Error",error})
  }
})


app.post('/upgradeplan',authmiddleware,requireredis,async (req,res)=>{
    try {
    
  } catch (error) {
    return res.status(500).json({message:"Internal Server Error",error})
  }
})


app.post('/generatekey',authmiddleware,requireredis,async(req,res)=>{
  try {
    
  } catch (error) {
    return res.status(500).json({message:"Internal Server Error",error})
  }
})

