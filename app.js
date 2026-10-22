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

const smallletters=['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];
const largeletters=['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
const numbers=[0,1,2,3,4,5,6,7,8,9,0];


// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({extended:true}))

// const redisopt={
// url:process.env.REDIS_CLI,
// socket:{
//     reconnectStrategy:(retries)=> Math.min(retries*250,3000)
// }
// }

// const redispublisher=createClient(redisopt);
// const redissubscriber=createClient(redisopt);

// for (const client of [redispublisher, redissubscriber]){
//     client.on('error',(err)=>console.log("REDIS CLIENT ERROR",err))
// }



// function requireredis(req,res,next){
//     if (redispublisher.isReady && redissubscriber.isReady) return next()
//     return res.status(503).json({message:"Redis is not ready"})
// }

// async function startapp(){
//   if(!MONGODB_URL|| !JWT_SECRET) return res.status(500).json({message:"MONGODB_URL or JWT_SECRET is missing"});
//   await Promise.all([
//     redissubscriber.connect(),
//     redispublisher.connect(),
//     mongoose.connect(MONGODB_URL).then(()=>console.log("MongoDB connected"))
//   ])

//   await redissubscriber.subscribe('notification',(message)=>{
//     console.log("Recieved message", message)
//   })

//   app.listen(PORT,()=>console.log(`Server running at PORT: ${PORT}`))
// }


// startapp();


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

console.log(generateapikey())

