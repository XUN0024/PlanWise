const USER="00000000-0000-4000-8000-000000000001";
const context=()=>({type:"expenses",action:"review",month:"2026-10",smallAmount:"20.00",search:"",category:""});
function report(){
  const item=(n,cents,category,date)=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`,version:"2026-11-07 00:00:00+00",note:category==="Food"?"Lunch":"Bill",amount_cents:String(cents),category,date,time:"12:30:00",payment_method:"cash"});
  return{schema:"expenses-insights-v1",owner_id:USER,currency:"MYR",timezone:"Asia/Kuala_Lumpur",data_version:"d".repeat(32),
    scope:{month:"2026-10",date_from:"2026-10-01",date_to:"2026-10-31",previous_from:"2026-09-01",previous_to:"2026-09-30",as_of:"2026-11-07",partial:false,small_amount_cents:"2000",search:null,category:null},
    current:{count:"3",total_cents:"6000",average_cents:"2000",daily_average_cents:"194",days:"31",active_days:"3",small:{count:"2",total_cents:"3000",share_basis_points:"5000"},
      categories:[{key:"Bills",count:"1",total_cents:"3000",share_basis_points:"5000"},{key:"Food",count:"2",total_cents:"3000",share_basis_points:"5000"}],
      methods:[{key:"cash",count:"3",total_cents:"6000"}],daily:[{date:"2026-10-01",count:"1",total_cents:"1000"},{date:"2026-10-02",count:"1",total_cents:"2000"},{date:"2026-10-03",count:"1",total_cents:"3000"}],
      weekdays:[{key:"4",count:"1",total_cents:"1000"},{key:"5",count:"1",total_cents:"2000"},{key:"6",count:"1",total_cents:"3000"}],frequent_group_count:"1",frequent:[{description:"Lunch",count:"2",total_cents:"3000"}],
      largest:[item(2,3000,"Bills","2026-10-03"),item(3,2000,"Food","2026-10-02"),item(4,1000,"Food","2026-10-01")]},
    previous:{count:"1",total_cents:"4000",average_cents:"4000",daily_average_cents:"133",days:"30",active_days:"1",small:{count:"0",total_cents:"0",share_basis_points:"0"},
      categories:[{key:"Bills",count:"1",total_cents:"4000",share_basis_points:"10000"}],methods:[{key:"cash",count:"1",total_cents:"4000"}],daily:[{date:"2026-09-01",count:"1",total_cents:"4000"}],weekdays:[{key:"2",count:"1",total_cents:"4000"}],frequent_group_count:"0",frequent:[],largest:[item(5,4000,"Bills","2026-09-01")]},
    comparison:{delta_cents:"2000",change_basis_points:"5000",categories:[{key:"Food",current_cents:"3000",previous_cents:"0",delta_cents:"3000"},{key:"Bills",current_cents:"3000",previous_cents:"4000",delta_cents:"-1000"}]}};
}
module.exports={USER,context,report};
