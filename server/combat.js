/*
*INIT
every frame, boost ability charge,
if charge > period && pressed, start input
reset other ability / mana if needed

call custom func if action has func
anim

*ADD MODIFIERS
add player bonus to atk
add dmg from player to atk (mastery, dmgMain, curse)
add dmg from weapon to atk



call custom func if attack has func
spawn bullet or strike




*/
Combat = {};

//NOTE: Combat.action.attack.mods is inside utilityShare.js

//ACTION//
Combat.action = function(id,action){
    var player = typeof id === 'string' ? fullList[id] : id;
	if(!player) return;

    if(action.anim)	changeSprite(player,{'anim':action.anim});
	
	if(action.func && action.param){
		keyFunction(id,action.func,action.param);
	}
    
}
Combat.action.attack = function(id,action){   
	var player = typeof id === 'string' ? fullList[id] : id;
	for(var i = 0 ; i < action.attack.length ; i ++){
		//Add Bonus and mastery
		var atk = typeof action.attack[i] === 'function' ? action.attack[i]() : deepClone(action.attack[i]); 
		atk = Combat.action.attack.mod(player,atk);
		Combat.action.attack.perform(player,atk);
	}
}

Combat.action.attack.perform = function(player,attack,extra){   //extra used for stuff like boss loop
    if(extra){ attack = deepClone(attack); }    //cuz probably from boss
	
	//At this point, player.bonus/mastery must be already applied
	if(attack.func && attack.func.chance >= Math.random()){
		keyFunction(player.id,attack.func.func,attack.func.param);
	}

	var atkList = [attack];
	for(var i = 1 ; i < attack.amount ; i ++)
		atkList.push(deepClone(attack));
	
	
	var initAngle = player.angle + Math.randomML() * (attack.aim + player.aim) || 0;
	var atkAngle = attack.angle; var atkAmount = attack.amount;

	for(var i = 0 ; i < atkList.length ; i ++){
		var angle = initAngle + atkAngle * (atkAmount-2*(i+1/2)) / (atkAmount*2) ;
		angle = (angle+360) % 360;
		
		if(extra && extra.angle !== undefined){ angle = extra.angle; }	//quickfix
		
		Attack.creation(player,atkList[i],{'angle':angle,'num':i,'maxNum':atkList[i].amount});
	}
}	
	

//Other Weapon Function
Combat.action.summon = function(key,info,enemy){
	var name = info.name || Math.randomId();
	info.maxChild = info.maxChild || 1;
	info.time = info.time || 1/0;
	info.distance = info.distance || 500;
	var master = fullList[key];
	
	if(!master.summon[name]){	master.summon[name] = {'child':{}}; }
	
	amountMod = 1; 
	timeMod = 1;
	atkMod = 1;
	defMod = 1;
	
	if(master.bonus && master.bonus.summon){
		amountMod = master.bonus.summon.amount;
		timeMod = master.bonus.summon.time;
		atkMod = master.bonus.summon.atk;
		defMod = master.bonus.summon.def;
	}
	
	if(info.maxChild*amountMod > Object.keys(master.summon[name].child).length){	
		var param0 = {
			'x':master.x,
			'y':master.y,
			'map':master.map,
			'extra':{'deleteOnceDead':1,
					'summoned':{'father':master.id,'time':info.time*timeMod,'distance':info.distance},
					'targetIf':'summoned',
					'hitIf':'summoned',
					}
		};
		var childList = Mortal.creation.group(param0,enemy);
		
		for(var i in childList){
			var cid = childList[i];
			master.summon[name].child[cid] = 1;	
			
			if(atkMod !== 1){ Mortal.boost(cid,{'name':'summon','stat':'dmgMain','time':info.time*timeMod,'type':'*','amount':atkMod}); }
			if(defMod !== 1){ Mortal.boost(cid,{'name':'summon','stat':'defMain','time':info.time*timeMod,'type':'*','amount':defMod}); }
		
		}
	}	
}

Combat.action.boost = function(key,info){
    Mortal.boost.apply(this, info);
}

/*
status chance: dmg/maxhp * abilityMod [1] * playerMod [1]
leech chance: unrelated to dmg. abilityMod [1] * playerMod [0]

*/

//COLLISION//
Combat.collision = function(b,mort){
	if(mort.attackReceived[b.hitId]) return;    //for pierce
    mort.attackReceived[b.hitId] = true;
	
	if(b.hitImg){addAnim(b.hitImg.name,mort.id,b.hitImg.sizeMod || 1);}
	if(b.healing){ Mortal.changeResource(mort,b.healing); return; }
	
	if(b.crit.chance >= Math.random()){ b = Combat.collision.crit(b) }
	
	var dmg = Combat.collision.damage(b,mort);
	Combat.collision.reflect(dmg,b,mort);
	
	//Mods
	if(b.leech.chance && b.leech.chance >= Math.random()){ Combat.collision.leech(mort,b) }
	if(b.pierce.chance && b.pierce.chance >= Math.random()){ Combat.collision.pierce(b) } else {b.toRemove = 1;};
	
	if(b.onHit && b.onHit.chance >= Math.random()){	Combat.action.attack.perform(b,b.onHit.attack);}
	if(b.curse && b.curse.chance >= Math.random()){ Combat.collision.curse(mort,b.curse); }
	
	//Apply Status
	Combat.collision.status(dmg,b,mort);
	
	
}

//Apply Status
Combat.collision.status = function(dmg,b,target){
	var ar = {
		'melee':'bleed',
		'range':'knock',
		'magic':'drain',
		'fire':'burn',
		'cold':'chill',
		'lightning':'confuse'
	}
	for(var i in ar){
		var mod = b[ar[i]].chance;
		
		var minToRoll = 1-Math.pow(dmg[i] / target.resource.hp.max,1.5);
		
		if(minToRoll*mod >= 0.001 && Math.random()*mod >= minToRoll){ 
			Combat.collision.status[ar[i]](target,b,dmg);
		}
	}	
	
}
	
Combat.collision.status.burn = function(mort,b){	
	var info = b.burn;
	mort.burned.time = info.time*(1-mort.resist.burn); 
	mort.burned.magn = info.magn*(1-mort.resist.burn); 
	mort.burned.type = info.type || 'hp'; 
}

Combat.collision.status.confuse = function(mort,b){
	var info = b.confuse;
	mort.confused.time = info.time*(1-mort.resist.confuse);
	mort.confused.magn = info.magn*(1-mort.resist.confuse);
	var left = Math.floor(Math.random()*4);
	mort.confused.input = [left%4,(left+3)%4,(left+2)%4,(left+1)%4];
	Mortal.boost(mort,{'stat':'aim','type':"+",'value':mort.confused.magn,'time':mort.confused.time,'name':'confuse'});
}

Combat.collision.status.bleed = function(mort,b,dmg){
	var info = b.bleed;
	mort.bleeded.push({'time':info.time,'magn':dmg.melee * info.magn/info.time *(1-mort.resist.bleed)});
}

Combat.collision.status.chill = function(mort,b){
	var info = b.chill;
	Mortal.boost(mort,{'stat':'maxSpd','type':"*",'value':b.chill.magn*(1-mort.resist.chill),'time':b.chill.time*(1-mort.resist.chill),'name':'chill'}); 
	//if(b.chill.atk){ addBoost(mort,{'stat':'atkSpd-0','type':"*",'value':b.chill.magn*(1-mort.resist.chill),'time':b.chill.time*(1-mort.resist.chill),'name':'chill'}); }}
}

Combat.collision.status.knock = function(mort,b){
	var info = b.knock;
	mort.knocked.time = info.time*(1-mort.resist.knock); 
	mort.knocked.magn = info.magn*(1-mort.resist.knock);	
	mort.knocked.angle = b.moveAngle;
}

Combat.collision.status.drain = function(mort,b){
	var info = b.drain;
	
	var player = fullList[b.parent]; if(!player) return;
	
	var amount = mort.resource.mana.max * 0.05 * info.magn;

	player.mana += amount;
	mort.mana -= amount;
	mort.mana = mort.mana.mm(0);
}


//Apply Mods
Combat.collision.curse = function(mort,info){
	for(var i in info.boost){
		var boost = info.boost[i];
		Mortal.boost(mort,{'stat':boost.stat,'type':boost.type,'value':boost.value,'time':boost.time,'name':'curse'}); 
	}
}

Combat.collision.pierce = function(b){
	b.pierce.amount--; 
	if(b.pierce.amount <= 0){ b.pierce.chance = 0; }
	b.dmgMain *= b.pierce.dmgReduc;
}

Combat.collision.leech = function(mort,b){
	var info = b.drain;
	
	var player = fullList[b.parent]; if(!player) return;
	
	var amount = (player.resource.hp.max-player.hp) * 0.01 * info.magn;

	player.hp += amount;
	player.hp = player.hp.mm(-1000,player.resource.hp.max);
	
}

Combat.collision.reflect = function(dmg,bullet,mort){
	var attacker = fullList[bullet.parent];
	if(attacker && attacker.hp){
		for(var i in elementName){
			Mortal.changeHp(attacker,-mort.reflect[elementName[i]]*dmg[elementName[i]]/attacker.defMain);
		}
	}
}
	
Combat.collision.crit = function(b){
	for(var i in b.dmg){
		b.dmg[i] *= b.crit.magn;
	}
	return b;
}

Combat.collision.damage = function(bullet,player){
	var dmgInfo = Combat.collision.damage.calculate(bullet.dmg,player.def)
	var dmg = dmgInfo.sum;
	Mortal.changeHp(player,-dmg/player.defMain);
	
	if(player.damagedBy[bullet.parent] === undefined) { player.damagedBy[bullet.parent] = 0; }
	player.damagedBy[bullet.parent] += dmg;
	
	return dmgInfo;
}

Combat.collision.damage.calculate =function(a,d){
	var info = {};
	var dmg = 0;
	for(var i in a){ 
		var add = a[i]/d[i]; 
		dmg += add;
		info[i] = add;
	}
	info.sum = dmg;
	return info;
}














































