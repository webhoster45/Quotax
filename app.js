require('dotenv').config();
const express=require('express');
const app=express();
const mongoose=require('mongoose');
const path=require('path');
const cors=require('cors');
const {createClient}=require('redis');

const redisopt={
url:process.env.REDIS_CLI,
socket:{
    reconnectStrategy:(retries)=> Math.min(retries*250,3000)
}
}

const redispubisher=createClient(redisopt);
const redissubscriber=createClient(redisopt);

const PORT=process.env.PORT || 5000;
