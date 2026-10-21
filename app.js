require('dotenv').config();
const express=require('express');
const app=express();
const mongoose=require('mongoose');
const path=require('path');
const cors=require('cors');
const {createClient}=require('redis');

const PORT=process.env.PORT || 5000;

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


