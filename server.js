const express = require('express');
const app = express();
const port = process.env.PORT || 7770;
const ip = process.env.IP;
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
const rimraf = require('rimraf');
const extract = require('extract-zip')
const detector = fr.FaceDetector()
const https = require('https')
const async = require('async');

// global array responsible for maintaining the user memory tokens
// this should be the main memory consumpti›on piece of the application
var recognizer1 = {};

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(fileUpload());

const httpsOptions = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem')
}

const url = 'mongodb://meetesh:polkmn@ds223009.mlab.com:23009/carnival';
const dbName = 'carnival';

const smtpTransport = nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    auth: {
        user: "meeteshmehta4@gmail.com",
        pass: "rawhxmesdeueprgt"
    }
});

const COLLECTION_SESSION = "session"; 
const COLLECTION_USERS = "users"; 
const COLLECTION_RAW = "raw"; 

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
	// https.createServer(httpsOptions, app).listen(port);
	app.listen(port, ()=> console.log("live at "+port));
});





// SESSION MANAGEMENT
app.use(require('express-session')({
  secret: 'Its in my dick, bitch',
  cookie: {
    maxAge: session_timeout
  },
  store: store,
  resave: false,
  saveUninitialized: false
}));


app.post('/profile', urlencodedParser, function(req, res) {
	if(req.session.auth && req.body && req.body.roll_no && req.body.image1 && req.body.image2 && req.body.image3 && req.body.image4 && req.body.image5) {
		var image1 = req.body.image1.replace(/^data:image\/\w+;base64,/, '');
		var image2 = req.body.image2.replace(/^data:image\/\w+;base64,/, '');
		var image3 = req.body.image3.replace(/^data:image\/\w+;base64,/, '');
		var image4 = req.body.image4.replace(/^data:image\/\w+;base64,/, '');
		var image5 = req.body.image5.replace(/^data:image\/\w+;base64,/, '');
		var images = [image1, image2, image3, image4, image5];
		var raw_roll = req.body.roll_no;
		req.body.roll_no = req.body.roll_no.replace(/\//g, '_');

		var name = req.body.first_name + "_" + req.body.last_name;
		req.body.name = req.body.roll_no.replace(/\$/g, '_');

		var recognizer = fr.AsyncFaceRecognizer();
		var finals = [];

		var dir = "./raw/"+req.body.roll_no;
		if (!fs.existsSync(dir)){
		    fs.mkdirSync(dir);
		}

		var dd = "./raw/"+req.body.roll_no+"/";

		async.each([0,1,2,3,4], function (file, callback) {

		    fs.writeFile(dd+file+".jpeg", images[file], {encoding: 'base64'} , function (err) {
		        if (err) {
		            console.log(err);
		        }
		        else {
		            console.log('file written');
		        }

		        callback();
		    });

		}, function (err) {
		    if (err) {
		        console.log('A file failed to process');
		        return res.send("error: "+error);
		    }
		    else {
		        console.log('All files have been processed successfully');
        		if(recognizer1[req.session.email]) {
					recognizer = recognizer1[req.session.email];
				} else {
					try	{
						var modelState1 = require('./datasets/'+req.session.email+'.json')
						recognizer.load(modelState1);	
					} catch(err) {
					}
				}
				for(i=0;i<5;i++) {
					try {
						var final_image_from_uri = fr.loadImage(dd+i+".jpeg");
						// finals.push(recognizer.addFaces(detector.detectFaces(final_image_from_uri), req.body.roll_no ));
						var faces = detector.detectFaces(final_image_from_uri);
						if (faces.length > 0) {
							recognizer.addFaces(faces, name + "$" + req.body.roll_no);
						} else {
							return res.send("image not clear, please take better a image in which the entire face is clearly visible");
						}
					} catch (error) {
						return res.send("error: "+error);
					}
				}

		 		Promise.all(finals).then(() => { 
		 			
		 			fs.unlink('./datasets/'+ req.session.email +'.json', function(err) {
		 				console.log("promise done");
		 				console.log("NEW res: "+recognizer.getDescriptorState()[0].numFaces);
						fs.writeFileSync('./datasets/'+ req.session.email +'.json', JSON.stringify(recognizer.serialize()));
						rimraf(__dirname+'/tempDatasetBuffer/'+req.session.email, function () { console.log('done deleting folder'); });
						recognizer1[req.session.email] = recognizer;
			
			 			res.redirect("/");
		 			});
		 		} ).catch((error) => { console.log("promise error: "+error); });
		    }
		});





	} else {
		return res.redirect('/');
	}
});

app.get('/live', function(req, res) {
	if(req.session.auth) {
		res.render('live', { header: true, email: req.session.email });	
	} else {
		res.redirect('/');
	}
});

app.get('/generate', function(req, res) {
	if(req.session.auth) {
		res.render('generate', { header: true, email: req.session.email });	
	} else {
		res.redirect('/');
	}
});

// load login page here
app.get('/', function(req, res) {
	if(req.session.auth) {
		res.redirect('/dashboard');	
	} else {
		res.render('login', { header: false});	
	}
});

// do authentication here
app.post('/', urlencodedParser, function(req, res) {
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
		res.render('register', { header: false });
	} else {
		res.redirect('/dashboard');
	}
});

// do authentication here
app.post('/register', urlencodedParser, function(req, res) {
	if(!req.session.auth) {
		if (req.body && req.body.email && req.body.password && req.body.pin) {
			console.log(req.body);
			console.log(req.session.ver_pin);
			let dataToSend = { _id: req.body.email, password: req.body.password };
			if(req.session.ver_pin == req.body.pin) {
				req.session.auth = false;
				db.collection(COLLECTION_USERS).insertOne( dataToSend, function(err, result) {
					if(err) { 
						console.log(err);
						if(err.code == 11000) {
							res.send("Email already registered");
						} else {
							res.send("Error, contact help with error code: "+err.code);
						}
						 
					} else {
						fs.appendFile('./datasets/'+req.body.email+'.json', '', function (err) {
						  	if (err) throw err;
						  	console.log("successfully created new user");
							res.redirect("/");
						});
					}
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
			console.log("PIN: "+random_pin);
			
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

// reload dataset
app.post('/reload-dataset', function(req, res) {
	console.log("reload request");
	if( req.session.auth )	{
		var recognizer = fr.AsyncFaceRecognizer();
		if(recognizer1[req.session.email]) {
			recognizer = recognizer1[req.session.email];
			console.log("db res: "+recognizer1[req.session.email].getDescriptorState()[0].numFaces);
			res.send({error: false});
		} else {
			try	{
				var modelState1 = require('./datasets/'+req.session.email+'.json')
				recognizer.load(modelState1);
				recognizer1[req.session.email] = recognizer;
				console.log("db res: "+recognizer1[req.session.email].getDescriptorState()[0].numFaces);
				res.send({error: false});
			} catch(err) {
				res.send({error: true});
			}
		}
	} else {
		res.send({error: true});
	}
});



// load the dashboard page here
app.get('/dashboard', function(req, res) {
	
	if(req.session.auth) {
		var loaded = false;
		if(recognizer1[req.session.email]) {
			console.log("dash mem: "+recognizer1[req.session.email].getDescriptorState()[0].numFaces);
			console.log("active memory for "+req.session.email);
			loaded = true;
		} else {
			try	{
				var recognizer_temp = fr.AsyncFaceRecognizer();
				var modelState = require('./datasets/'+req.session.email+'.json')
				recognizer_temp.load(modelState);	
				console.log(recognizer_temp.getDescriptorState());
				recognizer1[req.session.email] = recognizer_temp;
				loaded = true;
			} catch(err) {
				loaded = false;
			}
		}
		res.render('dashboard', { loaded: loaded, header: true, email: req.session.email });
	} else {
		res.redirect('/');
	}
});

app.post('/get-database-resoruce', function(req, res) {
	 if(req.session.auth) {
	 	var recognizer;
		console.log("db res: "+recognizer1[req.session.email].getDescriptorState()[0].numFaces);
		if(recognizer1[req.session.email]) {
			recognizer = recognizer1[req.session.email];
		} else {
			var modelState = require('./datasets/'+req.session.email+'.json')
			recognizer.load(modelState);
			recognizer1[req.session.email] = recognizer;
		}
		if(recognizer) {
			res.send({ error: false, data: recognizer.getDescriptorState() });
		} else {
			res.send({ error: true });
		}
		
	 } else {
	 	res.send({ error: true });
	 }
});

app.post('/request', urlencodedParser, function(req, res) {
	if(req.session.auth) {
		if(req.body && req.body.type ) {
			
			if(req.body.type == 101) { // recongize face from base64 image
				var imageData = req.body.image.replace(/^data:image\/png;base64,/, "");
				var recognizer = fr.AsyncFaceRecognizer();
				
				if(recognizer1[req.session.email]) {
					recognizer = recognizer1[req.session.email];
				} else {
					var modelState = require('./datasets/'+req.session.email+'.json')
					recognizer.load(modelState);
					recognizer1[req.session.email] = recognizer;
				}
				
				console.log(recognizer1[req.session.email].getDescriptorState());
				
				if(recognizer1[req.session.email].getDescriptorState().length <= 1) {
					console.log("recognizer: "+recognizer.getDescriptorState().length);
					return res.send({error: true});
				}
				try {
					require("fs").writeFile("./tempImageBuffer/"+req.session.email+".png", imageData, 'base64', function(err) {
						if(err) { res.send( { error: true, data: {} } ) }
						
						var faceImages = detector.detectFaces(fr.loadImage("./tempImageBuffer/"+req.session.email+".png"));
						
						console.log(faceImages);

						recognizer.predict(faceImages[0]).then((predictions) => {
							var toSend = predictions;
							toSend = toSend.sort(compare);
							console.log(toSend);



						    res.send({error: false, data: toSend.slice(0,3) });
						}).catch((error) => {
						  	console.log(error);
						  	res.send({error: true});
						})
						
					});
				} catch(err) {
					res.send({error: true});
				}
			} else if(req.body.type == 102) {
				var imageData = req.body.image.replace(/^data:image\/png;base64,/, "");
				var recognizer = fr.AsyncFaceRecognizer();
				console.log("req 102");
				if(recognizer1[req.session.email]) {
					recognizer = recognizer1[req.session.email];
				} else {
					var modelState = require('./datasets/'+req.session.email+'.json')
					recognizer.load(modelState);
					recognizer1[req.session.email] = recognizer;
				}
								
				if(recognizer1[req.session.email].getDescriptorState().length <= 1) {
					console.log("recognizer: "+recognizer.getDescriptorState().length);
					return res.send({error: true});
				}
				try {
					require("fs").writeFile("./tempImageBuffer/"+req.session.email+".png", imageData, 'base64', function(err) {
						if(err) { res.send( { error: true, data: {} } ) }
						
						var faceImages = detector.detectFaces(fr.loadImage("./tempImageBuffer/"+req.session.email+".png"));
						var finals = [];
						for(i=0;i<faceImages.length;i++){
							finals.push(recognizer.predictBest(faceImages[i]).then((predictions) => {
								console.log(predictions);
								if(predictions.distance < 0.6) {
									res.write(predictions.className+"^");
								} else {
									res.write("unknown$unknown");
								}
								
							}).catch((error) => {
							  	console.log(error);
							  	return res.send({error: true});
							}));
						}

				 		Promise.all(finals).then(() => { 
							res.end();
							// res.send({error: false, data: toSend });
				 		} ).catch((error) => { console.log("promise error: "+error); });
					});
				} catch(err) {
					res.send({error: true});
				}

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

function compare(a, b) {
    const distA = a.distance;
    const distB = b.distance;
    let comparison = 0;
    if (distA > distB) {
        comparison = 1;
    } else if (distA < distB) {
        comparison = -1;
    }
    return comparison;
}


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
		let sampleFile = req.files.userfile;
		sampleFile.mv('./tempDatasetBuffer/'+req.session.email+'.zip', function(err) {
			if (err)
				return res.redirect('/');
			extract(__dirname+'/tempDatasetBuffer/'+req.session.email+'.zip', {dir: __dirname+'/tempDatasetBuffer/'+req.session.email}, function (err) {
			 	if(err) {
			 		res.send('Error');
			 	} else {
			 		var recognizer = fr.AsyncFaceRecognizer();
					if(recognizer1[req.session.email]) {
						recognizer = recognizer1[req.session.email];
					} else {
						try	{
							var modelState1 = require('./datasets/'+req.session.email+'.json')
							recognizer.load(modelState1);	
						} catch(err) {
						}
					}
			 		persons = getDirectories(req.session.email);
			 		console.log(persons);
			 		var finals = [];
			 		for(i=0; i<persons.length; i++){
			 			var current_images = getFiles(persons[i], req.session.email);
			 			var person_name = persons[i];
			 			var person_images = [];
			 			for(j=0; j<current_images.length; j++) {
			 				var final_image_from_uri = fr.loadImage(current_images[j]);
			 				console.log(current_images[j]);
			 				finals.push(recognizer.addFaces(detector.detectFaces(final_image_from_uri), persons[i]));
			 			}
			 		}
			 		
			 		Promise.all(finals).then(() => { 
			 			
			 			fs.unlink('./datasets/'+ req.session.email +'.json', function(err) {
			 				console.log("promise done");
			 				
			 				console.log("NEW res: "+recognizer.getDescriptorState()[0].numFaces);
 							fs.writeFileSync('./datasets/'+ req.session.email +'.json', JSON.stringify(recognizer.serialize()));
							
							rimraf(__dirname+'/tempDatasetBuffer/'+req.session.email, function () { console.log('done deleting folder'); });
					 		
							recognizer1[req.session.email] = recognizer;
				 			
				 			res.send("done updating dataset");
			 			});
			 			
			 			
			 			
			 			
			 			
			 		} ).catch((error) => { console.log("promise error: "+error); });
			 		
			 		
			 		
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