var db = null;
var count = null;
var current_kanji = null;
var showMeaning = true;

var data_version = 20150918;

$(document).ready(function() {
	ezdb.open({
		database : "kanji_renshuu",
	    version : 1,
	    tables : {
	        kanji : {
	        	key : { keyPath : "key" },
	        	indexes : [
	        	    { name : "level", columns : "level", unique : false },
                    { name : "order", columns : "order", unique : true }
                ]
	        },
	        meta : {
	        	key : { keyPath : "key" }
	        }
	    }
	})
	.then(function(database) {
		db = database;
		db.table("meta")
			.query()
			.equals("data_version")
			.go()
			.then(function(rs){
				if (rs.length == 0 || rs[0].value != data_version) {
					db.table("meta").update( { key : "data_version", value : data_version } ).then(reload);
				}
				else {
					db.table("kanji")
						.query()
						.count()
						.go()
						.then(function(total) {
							count = total;
							$("#overlay").hide();
						});
				}
			});
	});
	
	$("#cmdStart").click(start);
	$("#cmdSend").click(send);
	$("#cmdPass").click(pass);
	$("#inputAnswer").keydown(function(event) {
		if (event.which == 13 || event.keyCode == 13) {
			$("#cmdSend").click();
		}
	});
	$("input[name=meaningOption]").click(function() {
		showMeaning = $(this).val() == "visible"
		$("#meaning").css("opacity", showMeaning ? 1 : 0);
	});
	
	wanakana.bind(document.getElementById("inputAnswer"));
});

function start() {
	$("#cmdStart").hide();
	$("#answer").show();
	$("#score").show();
	next();
}

function reload() {
	$("#overlay").show();
	
	var promises = [];
	var percentage = 0;
	for (count=0; count < data.length; count++) {
		var json = data[count];
		var key = json.kanji[0].charCodeAt(0);
		for (var i=1; i < json.kanji.length; i++) {
			key += "-" + json.kanji[i].charCodeAt(0);
		}
		json.key = key;
		json.order = count;
		
		promises.push(db.table("kanji").update(json));
		
		promises[count].then(function() {
			percentage++;
			$("#loading").html("Carregando... " + Math.round(percentage*100/data.length) + "%");
		});
	}
	
	ezdb.wait(promises).then(function() {
		$("#overlay").hide();
	});
}

function send() {
	var input = $("#inputAnswer").val();
	
	if (input == null || input == "") {
		return;
	}
	
	if (!wanakana.isKana(input)) {
		showSendMessage("Use apenas kana!");
		return;
	}
	
	var correct = input === current_kanji.reading;
	if (!correct && current_kanji.other_readings != null) {
		for (var i=0; i < current_kanji.other_readings.length; i++) {
			correct = input === current_kanji.other_readings[i];
			if (correct) break;
		}
	}
	
	if (correct) {
		d3.select("#reading")
			.style("color", "blue")
			.transition(400)
			.style("opacity", "1");
		
		if (!showMeaning) {
			d3.select("#meaning")
				.transition(400)
				.style("opacity", "1");
		}
		
		setTimeout(next, 1500);
		
		$("#valCorrect").html(parseInt($("#valCorrect").html(),10) + 1);
	}
	else {
		showSendMessage("Errou!");
	}
}

function pass() {
	d3.select("#reading")
		.style("color", "red")
		.transition(400)
		.style("opacity", "1");
	
	if (!showMeaning) {
		d3.select("#meaning")
			.transition(400)
			.style("opacity", "1");
	}
	
	setTimeout(next, 2500);
	
	$("#valPass").html(parseInt($("#valPass").html(),10) + 1);
}

function showSendMessage(msg) {
	$("#msgAnswer").html(msg);
	d3.select("#msgAnswer").transition(400).style("opacity", "1");
	setTimeout(function() {
		d3.select("#msgAnswer").transition(250).style("opacity", "0");
	}, 1200);
}

function next() {
	var input = $("#inputAnswer").val("").focus();
	
	var order = Math.floor((Math.random() * count));
	
	if (current_kanji !== null && count > 1) {
		while (order === current_kanji.order) {
			order = Math.floor((Math.random() * count));
		}
	}
	
	db.table("kanji")
		.query()
		.index("order")
		.equals(order)
		.go()
		.then(function(rs){
			current_kanji = rs[0];
			buildCard(current_kanji);
		});
}

function buildCard(json) {
	var reading = json.reading;
	
	if (json.other_readings != null) {
		for (var i=0; i < json.other_readings.length; i++) {
			reading += ", " + json.other_readings[i];
		}
	}
	
	$("#reading").css("opacity", 0).html(reading);
	$("#kanji").css("font-size", (-20*json.kanji.length + 200)+"px").html(json.kanji);
	$("#level").html(json.level);
	
	if (!showMeaning) {
		$("#meaning").css("opacity", 0);
	}
	
	$("#meaning").html(json.meaning);
}