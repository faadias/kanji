/* EZDB - Yet Another Wrapper for IndexedDB
 * Version 1.0.0
 * 
 * Copyright (c) 2015 Felipe Dias, Twitter: @faadias1
 * 
 * Special thanks to Aaron Powell, whose 'db.js' was the inspiration for 
 * this project!
 * 
 * This file is part of EZDB.
 * 
 * EZDB is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * EZDB is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with EZDB.  If not, see <http://www.gnu.org/licenses/>.
 */

(function ( window ) {
    'use strict';
	
    var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
	var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange;
	var READONLY = "readonly";
	var READWRITE = "readwrite";
	
	if (indexedDB == null) {
		throw "IndexedDB not supported!";
	}
	
	
	//DBManager
	function DBManager() {
		var self = this;
		self._dbs = {};
	}
	
	DBManager.prototype.isClosed = function(dbName) {
		var self = this;
		if (self._dbs[dbName] == null) {
			throw "Database " + dbName + " couldn't be found!";
		}
		return self._dbs[dbName].isClosed();
	}
	
	DBManager.prototype.open = function(config) {
		var self = this;
		var promise = new Promise(function(resolve, reject) {
			if (config == null || config.database == null || config.version == null || config.tables == null) {
				throw "Invalid configuration parameters!";
			}
			
			var dbName = config.database;
			var dbVersion = config.version;
			var tableSchemas = config.tables;
			
			if (window.ezdb._dbs[dbName] != null && window.ezdb._dbs[dbName].isClosed()) {
				throw "Database " + dbName + " is already open!";
			}
			
			var request = indexedDB.open(dbName, dbVersion);
		
			request.onupgradeneeded = function(e) {
				if (window.ezdb._dbs[dbName] != null && !window.ezdb.isClosed(dbName)) {
					throw "Database " + dbName + " should be closed for an upgrade to take place!";
				}
				
				for (var tableName in tableSchemas) {
					var tableSchema = tableSchemas[tableName];
					var table = null;
					var isToBeDropped = false;
					
					if ( e.target.result.objectStoreNames.contains(tableName) ) {
						table = e.currentTarget.transaction.objectStore(tableName);
						if (tableSchema.drop != null) {
							isToBeDropped = tableSchema.drop;
						}
					}
					else {
						table = e.target.result.createObjectStore(tableName, tableSchema.key);
					}
					
					if (isToBeDropped) {
						e.target.result.deleteObjectStore(tableName);
					}
					else {
						if (tableSchema.indexes != null && Object.prototype.toString.call(tableSchema.indexes) === "[object Array]") {
							for (var i=0; i < tableSchema.indexes.length; i++) {
								var index = tableSchema.indexes[i];
								var name = index.name;
								var columns = index.columns;
								var unique = index.unique;
								if (!table.indexNames.contains(name)) {
									table.createIndex(name, columns, { unique : unique });
								}
							}
						}
						
						if (tableSchema.delindexes != null && Object.prototype.toString.call(tableSchema.delindexes) === "[object Array]") {
							for (var i=0; i < tableSchema.delindexes.length; i++) {
								var indexName = tableSchema.delindexes[i];
								if (table.indexNames.contains(indexName)) {
									table.deleteIndex(indexName);
								}
							}
						}
					}
				}
			};
			
			request.onblocked = function(e) { // If some other tab is loaded with the db, then it needs to be closed before we can proceed.
				reject(e.target.error);
				throw "Please close all other tabs with this site open!";
			};
			
			request.onsuccess = function(e) {
				var db = e.target.result;
				var tables = {};
				
				for (var i=0; i < db.objectStoreNames.length; i++) {
					var tableName = db.objectStoreNames[i];
					tables[tableName] = new Table(db, tableName, dbName);
				}
				
				if (self._dbs[dbName] != null) {
					self._dbs[dbName]._db = db;
					self._dbs[dbName]._version = dbVersion;
					self._dbs[dbName]._tables = tables;
					self._dbs[dbName]._closed = false;
				}
				else {
					self._dbs[dbName] = new Database(db, dbName, dbVersion, tables);
				}
				
				resolve(self._dbs[dbName]);
			}

			request.onerror = function(e) {
				reject(e.target.error);
			}
		});
		return promise;
	}
	
	DBManager.prototype.wait = function(promises) {
		if (promises == null) {
			return null;
		}
	
		if (Object.prototype.toString.call(promises) !== "[object Array]") {
			promises = [promises];
		}
		
		return Promise.all(promises);
	}
	
	//Database
	function Database(db, name, version, tables) {
		var self = this;
		self._db = db;
		self._name = name;
		self._version = version;
		self._tables = tables;
		self._closed = false;
	}
	
	Database.prototype.name = function() {
		var self = this;
		return self._name;
	}
	
	Database.prototype.version = function() {
		var self = this;
		return self._version;
	}
	
	Database.prototype.tables = function() {
		var self = this;
		return Object.keys(self._tables);
	}
	
	Database.prototype.table = function(tableName) {
		var self = this;
		return self._tables[tableName];
	}
	
	Database.prototype.close = function() {
		var self = this;
		self._closed = true;
		self._db.close();
		return self;
	}
	
	Database.prototype.isClosed = function() {
		var self = this;
		return self._closed;
	}
	
	Database.prototype.drop = function() {
		var self = this;
		if (!self._closed) {
			throw "Database should be closed before dropping it!";
		}
		
		var promise = new Promise(function(resolve, reject) {
			var request = indexedDB.deleteDatabase(self._name);
		
			request.onsuccess = function(e) {
				delete window.ezdb._dbs[self._name];
				resolve("Deleted database successfully.");
			}
			request.onerror = function(e) {
				reject(e.target.error);
			}
			request.onblocked = function(e) {
				reject(e.target.error);
			}
		});
		
		return promise;
	}
	
	
	Database.prototype.transaction = function() {
		var self = this;
		
		if (window.ezdb.isClosed(self._name)) {
			throw "Database " + self._name + " is closed!";
		}
		
		return new Transaction(self);
	}
	
	
	//Table
	function Table(db, name, dbName) {
		var self = this;
		self._db = db;
		self._name = name;
		self._dbName = dbName;
		self._dmlCounter = 0;
	}
	
	Table.prototype.truncate = function() {
		var self = this;
		
		if (window.ezdb.isClosed(self._dbName)) {
			throw "Database " + self._dbName + " is closed!";
		}
		
		self._dmlCounter++;
		var transaction = self._db.transaction([self._name], READWRITE);
		var table = transaction.objectStore(self._name);
		
		var promise = new Promise(function(resolve, reject) {
			table.clear();
			
			transaction.oncomplete = function(e) {
				self._dmlCounter--;
				resolve(self);
			};
			transaction.onerror = function(e) {
				self._dmlCounter--;
				reject(e.target.error);
			};
			transaction.onabort = function(e) {
				self._dmlCounter--;
				reject(e.target.error);
			};
		});
		
		return promise;
	}
	
	Table.prototype.insert = function(data) {
		var self = this;
		
		if (window.ezdb.isClosed(self._dbName)) {
			throw "Database " + self._dbName + " is closed!";
		}
		
		if (Object.prototype.toString.call(data) !== "[object Array]") {
			if (typeof data !== "object") {
				throw "Bad parameters...";
			}
			data = [data];
		}
		
		self._dmlCounter++;
		var transaction = self._db.transaction([self._name], READWRITE);
		var table = transaction.objectStore(self._name);
		var keys = new Array(data.length);
		var keysCounter = 0;
		
		var promise = new Promise (function(resolve, reject) {
			for (var i=0; i < data.length; i++) {
				var request = table.add(data[i]);
				request.onsuccess = function(e) {
					keys[keysCounter] = e.target.result;
					keysCounter++;
				}
			}
			
			transaction.oncomplete = function(e) {
				self._dmlCounter--;
				resolve(keys);
			};
			transaction.onerror = function(e) {
				self._dmlCounter--;
				reject(e.target.error);
			};
			transaction.onabort = function(e) {
				self._dmlCounter--;
				reject(e.target.error);
			};
		});
		
		return promise;
	}
	
	Table.prototype.update = function(data) {
		var self = this;
		
		if (window.ezdb.isClosed(self._dbName)) {
			throw "Database " + self._dbName + " is closed!";
		}
		
		if (data == null) {
			return new Update(self._db, self);
		}
		
		if (Object.prototype.toString.call(data) !== "[object Array]") {
			if (typeof data !== "object") {
				throw "Bad parameters...";
			}
			data = [data];
		}
		
		self._dmlCounter++;
		var transaction = self._db.transaction([self._name], READWRITE);
		var table = transaction.objectStore(self._name);
		var keys = new Array(data.length);
		var keysCounter = 0;
		
		var promise = new Promise (function(resolve, reject) {
			for (var i=0; i < data.length; i++) {
				var request = table.put(data[i]);
				request.onsuccess = function(e) {
					keys[keysCounter] = e.target.result;
					keysCounter++;
				}
			}
			
			transaction.oncomplete = function(e) {
				self._dmlCounter--;
				resolve(keys);
			};
			transaction.onerror = function(e) {
				self._dmlCounter--;
				reject(e.target.error);
			};
			transaction.onabort = function(e) {
				self._dmlCounter--;
				reject(e.target.error);
			};
		});
		
		return promise;
	}
	
	Table.prototype.remove = function(keys) {
		var self = this;
		
		if (window.ezdb.isClosed(self._dbName)) {
			throw "Database " + self._dbName + " is closed!";
		}
		
		if (keys == null) {
			return new Delete(self._db, self);
		}
		
		if (Object.prototype.toString.call(keys) !== "[object Array]") {
			if (typeof keys === "object") {
				throw "Bad parameters...";
			}
			keys = [keys];
		}
		
		self._dmlCounter++;
		var transaction = self._db.transaction([self._name], READWRITE);
		var table = transaction.objectStore(self._name);
		
		var promise = new Promise (function(resolve, reject) {
			for (var i=0; i < keys.length; i++) {
				table.delete(keys[i]);
			}
			
			transaction.oncomplete = function(e) {
				self._dmlCounter--;
				resolve(keys);
			};
			transaction.onerror = function(e) {
				self._dmlCounter--;
				reject(e.target.error);
			};
			transaction.onabort = function(e) {
				self._dmlCounter--;
				reject(e.target.error);
			};
		});
		
		return promise;
	}
	
	Table.prototype.query = function() {
		var self = this;
		
		if (window.ezdb.isClosed(self._dbName)) {
			throw "Database " + self._dbName + " is closed!";
		}
		
		return new Query(self._db, self);
	}
	
	//Query
	/*
	 * All keys <= x IDBKeyRange.upperBound(x)
	 * All keys < x IDBKeyRange.upperBound(x, true)
	 * All keys >= y IDBKeyRange.lowerBound(y)
	 * All keys > y IDBKeyRange.lowerBound(y, true)
	 * All keys >= x && <= y IDBKeyRange.bound(x, y)
	 * All keys >  x && <  y IDBKeyRange.bound(x, y, true, true)
	 * All keys >  x && <= y IDBKeyRange.bound(x, y, true, false)
	 * All keys >= x && <  y IDBKeyRange.bound(x, y, false, true)
	 * The key = z	IDBKeyRange.only(z)
	 */
	function Query(db, table) {
		var self = this;
		self._db = db;
		self._table = table;
		self._asc = true;
		self._distinct = false;
		self._keysmode = "off";
		self._count = false;
		self._filter = null;
		self._index = null;
		self._bounds = { upper : null, lower : null, upper_open : false, lower_open : false, equals : null };
		self._maxresults = 0;
	}
	
	Query.prototype.desc = function() {
		var self = this;
		if (self._count) {
			throw "Since count was specified for this query, 'desc' option is not allowed!";
		}
		self._asc = false;
		return self;
	}
	
	Query.prototype.distinct = function() {
		var self = this;
		if (self._count) {
			throw "Since count was specified for this query, 'distinct' option is not allowed!";
		}
		self._distinct = true;
		return self;
	}
	
	Query.prototype.first = function(maxresults) {
		var self = this;
		
		if (self._count) {
			throw "Since count was specified for this query, 'first' option is not allowed!";
		}
		
		if (maxresults == null) {
			maxresults = 0;
		}
	
		if (typeof maxresults !== "number" || maxresults !== parseInt(maxresults,10) || maxresults < 0) {
			throw "The parameter of 'first' should be a positive integer (or zero [default], for all results)!";
		}
		
		self._maxresults = maxresults;
		return self;
	}
	
	Query.prototype.keyvalue = function() {
		var self = this;
		if (self._count) {
			throw "Since count was specified for this query, 'keyvalue' option is not allowed!";
		}
		self._keysmode = "keyvalue";
		return self;
	}
	
	Query.prototype.keysonly = function() {
		var self = this;
		if (self._count) {
			throw "Since count was specified for this query, 'keysonly' option is not allowed!";
		}
		self._keysmode = "keysonly";
		return self;
	}
	
	Query.prototype.count = function() {
		var self = this;
		if (!self._asc || self._distinct || self._keysmode !== "off" || self._filter !== null || self._maxresults > 0) {
			throw "Count cannot be specified alongside some of the chosen options!";
		}
		self._count = true;
		return self;
	}
	
	Query.prototype.filter = function(filter) {
		var self = this;
		if (self._count) {
			throw "Since count was specified for this query, 'filter' option is not allowed!";
		}
		if (typeof filter !== "function") {
			throw "The supplied filter should be a function!";
		}
		self._filter = filter;
		return self;
	}
	
	Query.prototype.index = function(indexName) {
		var self = this;
		
		self._index = indexName;
		return self;
	}
	
	Query.prototype.upperBound = function(upperBound, excludeValue) {
		var self = this;
		
		if (self._bounds.equals !== null) {
			throw "'Equals' already specified for this query. An upper bound is not allowed!";
		}
		
		if (self._bounds.upper !== null) {
			throw "Upper bound already specified!";
		}
		
		if (upperBound == null) {
			throw "Not a valid upper bound!";
		}
		
		if (excludeValue == null) {
			excludeValue = false;
		}
		if (typeof excludeValue !== "boolean") {
			throw "Second parameter of upperBound should be a boolean!";
		}
		
		self._bounds.upper = upperBound;
		self._bounds.upper_open = excludeValue;
		
		return self;
	}
	
	Query.prototype.lowerBound = function(lowerBound, excludeValue) {
		var self = this;
		
		if (self._bounds.equals !== null) {
			throw "'Equals' already specified for this query. A lower bound is not allowed!";
		}
		
		if (self._bounds.lower !== null) {
			throw "Lower bound already specified!";
		}
		
		if (lowerBound == null) {
			throw "Not a valid lower bound!";
		}
		
		if (excludeValue == null) {
			excludeValue = false;
		}
		if (typeof excludeValue !== "boolean") {
			throw "Second parameter of lowerBound should be a boolean!";
		}
		
		self._bounds.lower = lowerBound;
		self._bounds.lower_open = excludeValue;
		
		return self;
	}
	
	Query.prototype.equals = function(z) {
		var self = this;
		
		if (self._bounds.equals !== null) {
			throw "'Equals' already specified for this query!";
		}
		
		if (self._bounds.lower !== null || self._bounds.upper !== null) {
			throw "Lower and/or upper bounds already specified. The 'equals' option is not allowed!";
		}
		
		self._bounds.equals = z;
		return self;
	}
	
	Query.prototype.go = function() {
		var self = this;
		var promise;
		
		if (self._keysmode === "keyvalue" && self._index === null) {
			throw "Keyvalue option can only be chosen if an index is specified!";
		}
		
		if (self._bounds.equals !== null) {
			self._bounds = IDBKeyRange.only(self._bounds.equals);
		}
		else {
			if (self._bounds.lower === null && self._bounds.upper === null) {
				self._bounds = null
			}
			else {
				if (self._bounds.lower !== null) {
					if (self._bounds.upper !== null) {
						 self._bounds = IDBKeyRange.bound(self._bounds.lower, self._bounds.upper, self._bounds.lower_open, self._bounds.upper_open);
					}
					else {
						self._bounds = IDBKeyRange.lowerBound(self._bounds.lower, self._bounds.lower_open);
					}
				}
				else { //self._bounds.upper !== null
					self._bounds = IDBKeyRange.upperBound(self._bounds.upper, self._bounds.upper_open);
				}
			}
		}
		
		if (self._count) {
			promise = new Promise(function(resolve, reject) {
				var transaction = self._db.transaction([self._table._name], self._table._dmlCounter > 0 ? READWRITE : READONLY);
				var table = transaction.objectStore(self._table._name);
				var request = null;
				
				if (self._index === null) {
					request = table.count(self._bounds);
				}
				else {
					var index = table.index(self._index);
					request = index.count(self._bounds);
				}
				
				request.onsuccess = function(e) {
					resolve(e.target.result);
				}
				request.onerror = function(e) {
					reject(e.target.error);
				}
			});
		}
		else {
			promise = new Promise(function(resolve, reject) {
				var data = [];
				var cursorType = self._asc ? "next" : "prev";
				if (self._distinct) {
					cursorType += "unique";
				}
				
				var tranmode = self._table._dmlCounter > 0 ? READWRITE : READONLY;
				
				if (tranmode === READWRITE) {
					self._table._dmlCounter++;
				}
				
				var transaction = self._db.transaction([self._table._name], tranmode);
				var table = transaction.objectStore(self._table._name);
				var request = null;
				
				if (self._index === null) {
					request = table.openCursor(self._bounds, cursorType);
				}
				else {
					var index = table.index(self._index);
					request = self._keysmode !== "off" && self._filter === null ? index.openKeyCursor(self._bounds, cursorType) : index.openCursor(self._bounds, cursorType); //the filter could make use of other attributes, fetched only in a normal cursor
				}
				
				var results_counter = 0;
				
				request.onsuccess = function(e) {
					var cursor = e.target.result;
					if (cursor && (self._maxresults === 0 || results_counter < self._maxresults)) {
						if (self._filter === null || self._filter(cursor.value)) {
							switch (self._keysmode) {
							case "keyvalue":
								data.push({ key : cursor.primaryKey, value : cursor.key });
								break;
							case "keysonly":
								data.push(cursor.primaryKey);
								break;
							default:
								data.push(cursor.value);
								break;
							}
							
							results_counter++;
						}
						cursor.continue();
					}
				}
				
				transaction.oncomplete = function(e) {
					if (tranmode === READWRITE) {
						self._table._dmlCounter--;
					}
					resolve(data);
				};
				transaction.onerror = function(e) {
					if (tranmode === READWRITE) {
						self._table._dmlCounter--;
					}
					reject(e.target.error);
				};
				transaction.onabort = function(e) {
					if (tranmode === READWRITE) {
						self._table._dmlCounter--;
					}
					reject(e.target.error);
				};
			});
		}
		
		return promise;
	}
	
	//Update
	function Update(db, table) {
		var self = this;
		self._db = db;
		self._table = table;
		self._index = null;
		self._bounds = null;
		self._set = null;
		self._del = null;
	}
	
	Update.prototype.index = function(indexName) {
		var self = this;
		
		self._index = indexName;
		return self;
	}
	
	Update.prototype.upperBound = function(upperBound, excludeValue) {
		var self = this;
		
		if (excludeValue == null) {
			excludeValue = false;
		}
		if (typeof excludeValue !== "boolean") {
			throw "Second parameter of upperBound should be a boolean!";
		}
		
		self._bounds = IDBKeyRange.upperBound(upperBound, excludeValue);
		
		return self;
	}
	
	Update.prototype.lowerBound = function(lowerBound, excludeValue) {
		var self = this;
		
		if (excludeValue == null) {
			excludeValue = false;
		}
		if (typeof excludeValue !== "boolean") {
			throw "Second parameter of lowerBound should be a boolean!";
		}
		
		self._bounds = IDBKeyRange.lowerBound(lowerBound, excludeValue);
		
		return self;
	}
	
	Update.prototype.bounds = function(lowerBound, upperBound, excludeLower, excludeUpper) {
		var self = this;
		
		if (excludeLower == null) {
			excludeLower = false;
		}
		if (excludeUpper == null) {
			excludeUpper = false;
		}
		if (typeof excludeLower !== "boolean" || typeof excludeUpper !== "boolean") {
			throw "The last two parameters of bounds should be booleans!";
		}
		
		self._bounds = IDBKeyRange.upperBound(lowerBound, upperBound, excludeLower, excludeUpper);
		
		return self;
	}
	
	Update.prototype.equals = function(z) {
		var self = this;
		if (self._count) {
			throw "Since count was specified for this query, other options are not allowed!";
		}
		self._bounds = IDBKeyRange.only(z);
		return self;
	}
	
	Update.prototype.set = function(set) {
		var self = this;
		
		if (set == null || typeof set !== "object" || Object.prototype.toString.call(set) === "[object Array]") {
			throw "A set of changes should be specified as a json object!";
		}
		
		self._set = set;
		
		return self;
	}
	
	Update.prototype.del = function(del) {
		var self = this;
		
		if (del == null) {
			throw "A set of deletions should be specified either as a single column name, an array of column names or a json object!";
		}
		
		if (typeof del !== "object" && Object.prototype.toString.call(del) !== "[object Array]") {
			del = [del];
		}
		
		self._del = del;
		
		return self;
	}
	
	Update.prototype.go = function() {
		var self = this;
		var promise;
		
		if (self._set == null && self._del == null) {
			throw "A set of changes or a deletion set should be specified!";
		}
		
		promise = new Promise(function(resolve, reject) {
			var data = [];
			
			self._table._dmlCounter++;
			var transaction = self._db.transaction([self._table._name], READWRITE);
			var table = transaction.objectStore(self._table._name);
			var request = null;
			
			if (self._index === null) {
				request = table.openCursor(self._bounds);
			}
			else {
				var index = table.index(self._index);
				request = index.openCursor(self._bounds);
			}
			
			request.onsuccess = function(e) {
				var cursor = e.target.result;
				if (cursor) {
					var updateData = cursor.value;
					
					for(var key in self._set) {
						if (typeof self._set[key] === "function") {
							var getter = function(key) {
								return updateData[key];
							};
							
							updateData[key] = self._set[key](getter);
						}
						else {
							updateData[key] = self._set[key];
						}
					}
					
					if (self._del != null) {
						if (Object.prototype.toString.call(self._del) === "[object Array]") {
							for(var i=0; i < self._del.length; i++) {
								var key = self._del[i]
								delete updateData[key];
							}
						}
						else { //json
							for(var key in self._del) {
								var getter = function(key) {
									return updateData[key];
								};
								if (self._del[key] === true || ( typeof self._del[key] === "function" && self._del[key](getter) )) {
									delete updateData[key];
								}
							}
						}
					}
					
					var updateRequest = cursor.update(updateData);
					updateRequest.onsuccess = function(e) {
						data.push(e.target.result);
					};
					
					cursor.continue();
				}
			};
			
			transaction.oncomplete = function(e) {
				self._table._dmlCounter--;
				resolve(data);
			};
			transaction.onerror = function(e) {
				self._table._dmlCounter--;
				reject(e.target.error);
			};
			transaction.onabort = function(e) {
				self._table._dmlCounter--;
				reject(e.target.error);
			};
		});
		
		return promise;
	}
	
	//Delete
	function Delete(db, table) {
		var self = this;
		self._db = db;
		self._table = table;
		self._index = null;
		self._bounds = null;
		self._filter = null;
	}
	
	Delete.prototype.index = function(indexName) {
		var self = this;
		
		self._index = indexName;
		return self;
	}
	
	Delete.prototype.upperBound = function(upperBound, excludeValue) {
		var self = this;
		
		if (excludeValue == null) {
			excludeValue = false;
		}
		if (typeof excludeValue !== "boolean") {
			throw "Second parameter of upperBound should be a boolean!";
		}
		
		self._bounds = IDBKeyRange.upperBound(upperBound, excludeValue);
		
		return self;
	}
	
	Delete.prototype.lowerBound = function(lowerBound, excludeValue) {
		var self = this;
		
		if (excludeValue == null) {
			excludeValue = false;
		}
		if (typeof excludeValue !== "boolean") {
			throw "Second parameter of lowerBound should be a boolean!";
		}
		
		self._bounds = IDBKeyRange.lowerBound(lowerBound, excludeValue);
		
		return self;
	}
	
	Delete.prototype.bounds = function(lowerBound, upperBound, excludeLower, excludeUpper) {
		var self = this;
		
		if (excludeLower == null) {
			excludeLower = false;
		}
		if (excludeUpper == null) {
			excludeUpper = false;
		}
		if (typeof excludeLower !== "boolean" || typeof excludeUpper !== "boolean") {
			throw "The last two parameters of bounds should be booleans!";
		}
		
		self._bounds = IDBKeyRange.upperBound(lowerBound, upperBound, excludeLower, excludeUpper);
		
		return self;
	}
	
	Delete.prototype.equals = function(z) {
		var self = this;
		if (self._count) {
			throw "Since count was specified for this query, other options are not allowed!";
		}
		self._bounds = IDBKeyRange.only(z);
		return self;
	}
	
	Delete.prototype.filter = function(filter) {
		var self = this;
		
		if (filter == null || typeof filter !== "function") {
			throw "The deletion filter should be a function!";
		}
		
		self._filter = filter;
		
		return self;
	}
	
	Delete.prototype.go = function() {
		var self = this;
		var promise;
		
		promise = new Promise(function(resolve, reject) {
			var data = [];
			
			self._table._dmlCounter++;
			var transaction = self._db.transaction([self._table._name], READWRITE);
			var table = transaction.objectStore(self._table._name);
			var keyPath = table.keyPath;
			var request = null;
			
			if (self._index === null) {
				request = table.openCursor(self._bounds);
			}
			else {
				var index = table.index(self._index);
				request = index.openCursor(self._bounds);
			}
			
			request.onsuccess = function(e) {
				var cursor = e.target.result;
				if (cursor) {
					var deleteData = cursor.value;
					var getter = function(key) {
						return deleteData[key];
					};
					
					if (self._filter === null || self._filter(getter)) {
						data.push(deleteData[keyPath]);
						cursor.delete(deleteData);
					}
					
					cursor.continue();
				}
			};
			
			transaction.oncomplete = function(e) {
				self._table._dmlCounter--;
				resolve(data);
			};
			transaction.onerror = function(e) {
				self._table._dmlCounter--;
				reject(e.target.error);
			};
			transaction.onabort = function(e) {
				self._table._dmlCounter--;
				reject(e.target.error);
			};
		});
		
		return promise;
	}
	
	//TransactionUnit
	function TransactionUnit(tableName, trantype, data) {
		var self = this;
		self._tableName = tableName;
		self._trantype = trantype;
		self._data = data;
	}
	
	//Transaction
	function Transaction(database) {
		var self = this;
		self._database = database;
		self._transactions = [];
		self._resultset = {};
	}
	
	Transaction.prototype.insert = function(tableName, data) {
		var self = this;
		
		if (self._database.table(tableName) == null) {
			throw "Table '" + tableName + "' was not found in database " + self._database._name + "!"; 
		}
		
		if (Object.prototype.toString.call(data) !== "[object Array]") {
			if (typeof data !== "object") {
				throw "Bad parameters for transaction insert...";
			}
			data = [data];
		}
		
		for (var i=0; i < data.length; i++) {
			self._transactions.push(new TransactionUnit(tableName, "insert", data[i]));
		}
		
		return self;
	}
	
	Transaction.prototype.update = function(tableName, data) {
		var self = this;
		
		if (self._database.table(tableName) == null) {
			throw "Table '" + tableName + "' was not found in database " + self._database._name + "!"; 
		}
		
		if (Object.prototype.toString.call(data) !== "[object Array]") {
			if (typeof data !== "object") {
				throw "Bad parameters for transaction update...";
			}
			data = [data];
		}
		
		for (var i=0; i < data.length; i++) {
			self._transactions.push(new TransactionUnit(tableName, "update", data[i]));
		}
		return self;
	}
	
	Transaction.prototype.remove = function(tableName, keys) {
		var self = this;
		
		if (self._database.table(tableName) == null) {
			throw "Table '" + tableName + "' was not found in database " + self._database._name + "!"; 
		}
		
		if (Object.prototype.toString.call(keys) !== "[object Array]") {
			if (typeof keys === "object") {
				throw "Bad parameters...";
			}
			keys = [keys];
		}
		
		for (var i=0; i < keys.length; i++) {
			self._transactions.push(new TransactionUnit(tableName, "remove", keys[i]));
		}
		return self;
	}
	
	Transaction.prototype.commit = function() {
		var self = this;
		
		var tables = {};
		for (var i=0; i < self._transactions.length; i++) {
			var tableName = self._transactions[i]._tableName;
			tables[tableName] = tables[tableName] == null ? 0 : tables[tableName]+1;
			self._database.table(tableName)._dmlCounter++;
		}
		
		var transaction = self._database._db.transaction(Object.keys(tables), READWRITE);
		
		var promise = new Promise (function(resolve, reject) {
			for (var i=0; i < self._transactions.length; i++) {
				var unit = self._transactions[i];
				var table = transaction.objectStore(unit._tableName);
				var keyPath = table.keyPath;
				var trantype = unit._trantype;
				var request = null;
				
				if (self._resultset[unit._tableName] == null) {
					self._resultset[unit._tableName] = { "insert" : [], "update" : [], "remove" : [] };
				}
				
				switch(trantype) {
					case "insert":
						request = table.add(unit._data);
						request.onsuccess = function(e) {
							self._resultset[e.target.source.name].insert.push(e.target.result);
						};
						break;
					case "update":
						request = table.put(unit._data);
						request.onsuccess = function(e) {
							self._resultset[e.target.source.name].update.push(e.target.result);
						};
						break;
					case "remove":
						self._resultset[unit._tableName].remove.push(unit._data);
						table.delete(unit._data);
						break;
				}
			}
			
			transaction.oncomplete = function(e) {
				for (var tableName in tables) {
					var counter = tables[tableName];
					self._database.table(tableName)._dmlCounter -= counter;
				}
				resolve(self._resultset);
			};
			transaction.onerror = function(e) {
				for (var tableName in tables) {
					var counter = tables[tableName];
					self._database.table(tableName)._dmlCounter -= counter;
				}
				reject(e.target.error);
			};
			transaction.onabort = function(e) {
				for (var tableName in tables) {
					var counter = tables[tableName];
					self._database.table(tableName)._dmlCounter -= counter;
				}
				reject(e.target.error);
			};
		});
		
		return promise;
	}
	
	window.ezdb = new DBManager();
	
}) (window);
