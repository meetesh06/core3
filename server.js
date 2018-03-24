const express = require('express');
const app = express();
const port = process.env.PORT || 7770;
const fr = require('face-recognition')
const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');
const bodyParser = require('body-parser')
const nodemailer = require("nodemailer");
const session = require('express-session')
const session_timeout = 10800000;
const MongoDBStore = require('connect-mongodb-session')(session);
const fileUpload = require('express-fileupload');
// const zip = require('node-zip');
// const unzip = require('unzip');
const extract = require('extract-zip')
const detector = fr.FaceDetector()


// global array responsible for maintaining the user memory tokens
// this should be the main memory consumption piece of the application
var recognizer1 = {};

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(fileUpload());

const url = 'mongodb://localhost:27017';
const dbName = 'meetesh';
const smtpTransport = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    auth: {
        user: "mycampusdock@gmail.com",
        pass: "D@ckD@ck"
    }
});

const COLLECTION_SESSION = "session"; 
const COLLECTION_USERS = "users"; 

var db;
var urlencodedParser = bodyParser.urlencoded({ extended: false })
var store = new MongoDBStore({
    uri: url,
    collection: COLLECTION_SESSION
});
MongoClient.connect(url, function(err, client) {
	assert.equal(null, err);
	console.log("Connected successfully to server");
	db = client.db(dbName);
	app.listen(port, function(){
		console.log("Wa are live on "+port);
	});
});

// SESSION MANAGEMENT
app.use(require('express-session')({
  secret: 'Its in my dick, bitch',
  cookie: {
    maxAge: session_timeout // actual
  },
  store: store,
  resave: false,
  saveUninitialized: false
}));

// load login page here
app.get('/', function(req, res) {
	if(req.session.auth) {
		res.redirect('/dashboard');	
	} else {
		res.render('login');	
	}
});

// do authentication here
app.post('/', urlencodedParser, function(req, res) {
	console.log(req.session.auth);
	if(req.session.auth) {
		res.redirect('/dashboard');
	} else {
		if (req.body && req.body.email && req.body.password) {
			db.collection(COLLECTION_USERS).findOne( { _id: req.body.email }, function(err, result) {
				if(err) { res.send("Error") }
				console.log(result);
				if(result.password == req.body.password) {
					req.session.auth = true;
					req.session.email = req.body.email;
				} else {
					req.session.auth = false;
				}
				res.redirect('/');
			});
		} else {
			res.redirect('/');
		}
	}
});

// load login page here
app.get('/register', function(req, res) {
	if(!req.session.auth) {
		res.render('register');
	} else {
		res.redirect('/dashboard');
	}
});

// do authentication here
app.post('/register', urlencodedParser, function(req, res) {
	if(!req.session.auth) {
		if (req.body && req.body.email && req.body.password && req.body.pin) {
			let dataToSend = { _id: req.body.email, password: req.body.password };
			if(req.session.ver_pin == req.body.pin) {
				req.session.auth = false;
				db.collection(COLLECTION_USERS).insertOne( dataToSend, function(err, result) {
					if(err) { res.send("Error") }
					fs.appendFile('./datasets/'+req.body.email+'.json', '', function (err) {
					  	if (err) throw err;
					  	console.log("successfully created new user");
						res.redirect("/");
					});
				});
			} else {
				if(req.session) {
					req.session.destroy();
				}
				res.send("Incorrect Pin");
			}
		} else if(req.body && req.body.email) {
			var random_pin = Math.floor(1000 + Math.random() * 900000);
			var mailOptions={
		       to : req.body.email,
		       subject : "Verification for Open Face API",
		       text : "Your Verification Pin is: "+random_pin
		    }
			smtpTransport.sendMail(mailOptions, function(error, response){
		        if(error){
		            console.log(error);
		            res.send({ error: true });
		        }else{
		            console.log("Message sent: " + response.message);
		            res.send({ error: false });
		        }
		    });
		    req.session.auth = false;
		    req.session.ver_pin = random_pin;
		}
	} else {
		res.send({ error: true });
	}
});


// load the dashboard page here
app.get('/dashboard', function(req, res) {
	if(req.session.auth) {
		// ensuring the latest model is loaded
		var loaded;
		try	{
			var recognizer_temp = fr.FaceRecognizer();
			var modelState = require('./datasets/'+req.session.email+'.json')
			recognizer_temp.load(modelState);	
			console.log(recognizer_temp.getDescriptorState());
			recognizer1[req.session.email] = recognizer_temp;
			loaded = true;
		} catch(err) {
			loaded = false;
		}
		
		res.render('dashboard', { loaded: loaded });
	} else {
		res.redirect('/');
	}
});

app.post('/request', urlencodedParser, function(req, res) {
	if(req.session.auth) {
		if(req.body && req.body.type ) {
			
			if(req.body.type == 101) { // recongize face from base64 image
				var imageData = req.body.image.replace(/^data:image\/png;base64,/, "");
				// var recognizer = recognizer1[req.session.email];
				
				var recognizer = fr.FaceRecognizer();
				var modelState = require('./datasets/'+req.session.email+'.json')
				recognizer.load(modelState);	

				require("fs").writeFile("./tempImageBuffer/"+req.session.email+".png", imageData, 'base64', function(err) {
					if(err) { res.send( { error: true, data: {} } ) }
					var faceImages = detector.detectFaces(fr.loadImage("./tempImageBuffer/"+req.session.email+".png"));
					console.log(faceImages);
					var bestPrediction = recognizer.predict(faceImages[0]);
				 	console.log(bestPrediction);
					// console.log(recognizer.getFaceDescriptors(fr.loadImage("./tempImageBuffer/"+req.session.email+".png")));
				});

				res.send({error: false});
			} else if(req.body.type == 102) {
				
				console.log(req.data);

				if (!req.files)
					return res.send.send( { error: true } );

				// The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
				let sampleFile = req.files.sampleFile;

				// Use the mv() method to place the file somewhere on your server
				sampleFile.mv('./tempDatasetBuffer/'+  +'.zip', function(err) {
					if (err)
						return res.send.send( { error: true } );
					return res.send.send( { error: false } );
				});

			} else {
				res.send( { error: true } );
			}
		} else {
			res.send({error: true});
		}
	} else {
		res.send({error: true});
	}
	
});

// parent folder source

const superPath = './tempDatasetBuffer';

function getDirectories(dope) {
	current = superPath + '/' + dope;
	return fs.readdirSync(current).filter(function (file) {
		return fs.statSync(current+'/'+file).isDirectory();
	});
}

function getFiles(path, dope){
	console.log("Folder :"+path);
	path = superPath + '/'+ dope + '/' + path;
	var directories = [];
	fs.readdirSync(path).filter(function (file) {
		// var current_image = fr.loadImage(path+'/'+file);
	    // console.log(path+'/'+file);
	    if(!(file.split('.')[1] == 'jpg' || file.split('.')[1] == 'jpeg')) {
	    	console.log("FUCK YOU: "+file);
	    } else {
	    	directories.push(path+'/'+file);	
	    }
	    
	    return file;
  	});
  	return directories;
}

app.post('/handleDataset', urlencodedParser, function(req, res) {
	console.log(req.files);
	if(req.session.auth) {
		if (!req.files)
			return res.send( { error: true } );
		let sampleFile = req.files.file;
		sampleFile.mv('./tempDatasetBuffer/'+req.session.email+'.zip', function(err) {
			if (err)
				return res.redirect('/');
			extract(__dirname+'/tempDatasetBuffer/'+req.session.email+'.zip', {dir: __dirname+'/tempDatasetBuffer/'+req.session.email}, function (err) {
			 	if(err) {
			 		res.send('Error');
			 	} else {
			 		var recognizer = fr.FaceRecognizer();
			 		persons = getDirectories(req.session.email);
			 		console.log(persons);
			 		for(i=0; i<persons.length; i++){
			 			var current_images = getFiles(persons[i], req.session.email);
			 			for(j=0; j<current_images.length; j++) {
			 				var final_image_from_uri = fr.loadImage(current_images[j]);
			 				console.log(current_images[j]);
			 				var faceImages = detector.detectFaces(final_image_from_uri)
			 				recognizer.addFaces(faceImages, persons[i]);
			 			}
			 		}


			 		const modelState = recognizer.serialize();
					fs.writeFileSync('./datasets/'+ req.session.email +'.json', JSON.stringify(modelState));
			 		res.redirect('/');
			 	}
			})
			
		});
	} else {
		res.redirect('/');
	}

});

app.get('/logout', function(req, res) {
	req.session.auth = false;
	if(req.session) {
		req.session.destroy();
	}
	res.redirect('/');
});

// MEMORY MAINTENANCE WITH CALLBACK FUNCTIONALITY

// create global memory instance
function createGlobalMemoryInstance() {

	next(false, "Done Loading Instance");
}

// remove global memory instance
function removeGlobalMemoryInstance() {

	next(false, "Done Removing Instance");
}

function matchAgainstDataset(currentImageData, instanceId) {

	// return an array of possible matches
	next(false, { });	
}



// REFERENCE CODE 


// image loading

// var image[] = fr.loadImage[i]('./obama.jpg');
// recognizer.addFaces([image01, imag2], 'sheldon');



// // const obama = fr.loadImage('./obama.jpg');
// 	const recognizer = fr.FaceRecognizer();
// 	// recognizer.addFaces([obama], 'sheldon');
// 	// console.log(recognizer.getFaceDescriptors(obama));
// 	// save the reconginer to a seperate file 
// 	// var modelState = recognizer.serialize();
// 	// fs.writeFile('./datasets/model.json', JSON.stringify(modelState), function() {
// 	// 	res.render('index');
// 	// });
// 	var modelState = require('./datasets/model.json')
// 	recognizer.load(modelState)
// 	console.log(recognizer.getDescriptorState());
// 	recognizer1['dope1'] = recognizer;
// 	res.render('index');