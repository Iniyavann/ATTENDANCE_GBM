const bcrypt=require('bcryptjs'); const db=require('../database/db');
async function getOwner(){return db.get('SELECT * FROM owners ORDER BY id LIMIT 1');}
async function verifyPassword(password){const owner=await getOwner();return !!owner&&bcrypt.compareSync(password,owner.password_hash);}
async function changePassword(current,newPassword){const owner=await getOwner();if(!owner||!bcrypt.compareSync(current,owner.password_hash))throw Object.assign(new Error('Current owner password is incorrect.'),{status:401});await db.run('UPDATE owners SET password_hash=?,updated_at=? WHERE id=?',[await bcrypt.hash(newPassword,12),Date.now(),owner.id]);}
module.exports={getOwner,verifyPassword,changePassword};
