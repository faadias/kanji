function removeAcentos(palavra) {
	var com_acento = "באדגהויטךכםלמןףעץפצתשûüחסְֱֲֳִֵָֹÊֻּֽ־ֿ׃ׂױװײÚÙÛÜַׁ";
    var sem_acento = "aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN";
    
    var nova="";
    
    for(var i=0; i < palavra.length; i++) {
    	var letra = palavra[i];
    	var indice = com_acento.indexOf(letra);
    	if (indice >= 0) {
    		nova+=sem_acento[indice];
    	}
    	else {
    		nova+=letra;
    	}
    }
    
    return nova;
}