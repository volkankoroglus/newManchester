const { JsonWebTokenError } = require("jsonwebtoken");
const {
  User,
  Bet,
  Deposit,
  Withdrawal,
  Upi,
  Other,
  RandomPercentage,
} = require("../modals/userModal");
const nodemailer = require("nodemailer");
const { json } = require("express");
const crypto = require("crypto");

module.exports.gethome = async (req, res) => {
  let upi_id = await Upi.findOne({ upi: 1 }, { _id: 0, UPI: 1 });

  if (!upi_id || upi_id == undefined) {
    upi_id = { UPI: "all-in-one-payment@ybl" };
  }

  res.render("home", { upi: upi_id["UPI"] });
};

function randomPercent() {
  let percents = [];
  for (let i = 0; i < 16; i++) {
    let random = (1 + Math.random() * 4).toFixed(2);
    percents.push(random);
  }
  return percents;
}

async function create_random_percents(match_data) {
  let response = await RandomPercentage.create({
    league: match_data.fixture_id,
    percentage: randomPercent(),
    date: match_data["date"],
  });

  return response;
}

module.exports.history_matches = history_matches = async (req, res) => {
  let nDate = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Calcutta",
  });
  let today = new Date(nDate);

  // Subtract one day from current time
  today.setDate(today.getDate() - 1);

  let date = today.getDate() < 10 ? "0" + today.getDate() : today.getDate();
  let month =
    today.getMonth() < 9 ? "0" + (today.getMonth() + 1) : today.getMonth() + 1;
  let parsed_date = today.getFullYear() + "-" + month + "-" + date;

  let url = `https://v3.football.api-sports.io/fixtures/?date=${parsed_date}&status=FT`;
  // let url = `https://v3.football.api-sports.io/fixtures/?date=2022-10-12&status=NS`;

  let response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-host": "v3.football.api-sports.io",
      "x-rapidapi-key": "021ae6685ec46e47ec83f8848ac1d168",
      // "x-rapidapi-key": "823296afa77a4989062591abc46178ee"
    },
  });

  let matches = await response.json();

  let response_to_send = [];
  count = 0;
  for (let item of matches["response"]) {
    if (count > 100) {
      count++;
      break;
    }

    let match_date = new Date(item["fixture"]["date"]).toLocaleString("en-US", {
      timeZone: "Asia/Calcutta",
    });

    match_date = new Date(match_date);

    let match_data = {
      date: parsed_date,
      raw_date: match_date,
      fixture_id: item["fixture"]["id"],
      team_a: item["teams"]["home"]["name"],
      team_b: item["teams"]["away"]["name"],
      league: item["league"]["name"],
      team_a_logo: item["teams"]["home"]["logo"],
      team_b_logo: item["teams"]["away"]["logo"],
      team_a_goal: item["goals"]["home"],
      team_b_goal: item["goals"]["away"],
    };

    count++;
    response_to_send.push(match_data);
  }
  return res.status(200).send(response_to_send);
};

module.exports.get_live_bets = get_live_bets = async (req, res) => {
  let count = 0;
  // getting live bets
  const nDate = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Calcutta",
  });

  let today = new Date(nDate);

  let date = today.getDate() < 10 ? "0" + today.getDate() : today.getDate();
  let month =
    today.getMonth() < 9 ? "0" + (today.getMonth() + 1) : today.getMonth() + 1;
  let parsed_date = date + "/" + month + "/" + today.getFullYear();

  let url = `https://v3.football.api-sports.io/fixtures/?date=${today.getFullYear()}-${month}-${date}&status=NS`;
  // let url = `https://v3.football.api-sports.io/fixtures/?date=2022-10-12&status=NS`;

  let response = await fetch(url, {
    method: "GET",
    headers: {
      "x-rapidapi-host": "v3.football.api-sports.io",
      "x-rapidapi-key": "021ae6685ec46e47ec83f8848ac1d168",
      // "x-rapidapi-key": "823296afa77a4989062591abc46178ee"
    },
  });

  let matches = await response.json();
  // console.log(matches)

  //getting previous percentages

  let previous_percentages = await RandomPercentage.find({ date: parsed_date });

  if (previous_percentages == undefined || !previous_percentages) {
    //  iterate live bets and call make new percentages and save it in db

    for (let item of matches["response"]) {
      if (count > 100) {
        break;
      }

      let match_date = new Date(item["fixture"]["date"]).toLocaleString(
        "en-US",
        {
          timeZone: "Asia/Calcutta",
        }
      );
      match_date = new Date(match_date);

      let parsed_match_date =
        match_date.getDate() +
        "/" +
        match_date.getMonth() +
        1 +
        "/" +
        match_date.getFullYear();

      if (
        (today.getDate() == match_date.getDate() &&
          match_date.getHours() > today.getHours()) ||
        (today.getDate() == match_date.getDate() &&
          match_date.getHours() == today.getHours() &&
          match_date.getMinutes() > today.getMinutes() + 20)
      ) {
        let match_data = {
          date: parsed_match_date,
          fixture_id: item["fixture"]["id"],
          team_a: item["teams"]["home"]["name"],
          team_b: item["teams"]["away"]["name"],
          league: item["league"]["name"],
        };

        count++;

        create_random_percents(match_data);
      }
    }
  }

  // if some previous percentages exist or new were created then recheck them ;
  let new_previous_percentages = await RandomPercentage.find({
    date: parsed_date,
  });

  // creating key value pairs of these percentage;
  let percent_pairs = {};

  for (let percentages of new_previous_percentages) {
    percent_pairs[percentages["league"]] = percentages["percentage"];
  }

  // iterating live bets and rechecking them
  let fault_found = false;
  count = 0;

  for (let item of matches["response"]) {
    if (count > 100) {
      count++;
      break;
    }

    let match_date = new Date(item["fixture"]["date"]).toLocaleString("en-US", {
      timeZone: "Asia/Calcutta",
    });
    match_date = new Date(match_date);

    if (
      (today.getDate() == match_date.getDate() &&
        match_date.getHours() > today.getHours()) ||
      (today.getDate() == match_date.getDate() &&
        match_date.getHours() == today.getHours() &&
        match_date.getMinutes() > today.getMinutes() + 20)
    ) {
      count++;
      let match_data = {
        date: parsed_date,
        raw_date: match_date,
        fixture_id: item["fixture"]["id"],
        team_a: item["teams"]["home"]["name"],
        team_b: item["teams"]["away"]["name"],
        team_a_logo: item["teams"]["home"]["logo"],
        team_b_logo: item["teams"]["away"]["logo"],
        team_a_goal: item["goals"]["home"],
        team_b_goal: item["goals"]["away"],
        league: item["league"]["name"],
      };
      if (match_data["fixture_id"] in percent_pairs !== true) {
        fault_found = true;
        create_random_percents(match_data);
      }
    }
  }

  // console.log(matches['response']);

  if (fault_found) {
    let final_percentages = await RandomPercentage.find({ date: date });
    for (let percentages of new_previous_percentages) {
      percent_pairs[percentages["league"]] = percentages["percentage"];
    }
  }

  let response_to_send = [];
  count = 0;
  for (let item of matches["response"]) {
    if (count > 100) {
      count++;
      break;
    }

    let match_date = new Date(item["fixture"]["date"]).toLocaleString("en-US", {
      timeZone: "Asia/Calcutta",
    });

    match_date = new Date(match_date);

    if (
      (today.getDate() == match_date.getDate() &&
        match_date.getHours() > today.getHours()) ||
      (today.getDate() == match_date.getDate() &&
        match_date.getHours() == today.getHours() &&
        match_date.getMinutes() > today.getMinutes() + 20)
    ) {
      let match_data = {
        date: parsed_date,
        raw_date: match_date,
        fixture_id: item["fixture"]["id"],
        team_a: item["teams"]["home"]["name"],
        team_b: item["teams"]["away"]["name"],
        league: item["league"]["name"],
        team_a_logo: item["teams"]["home"]["logo"],
        team_b_logo: item["teams"]["away"]["logo"],
        team_a_goal: item["goals"]["home"],
        team_b_goal: item["goals"]["away"],
        percentage: percent_pairs[item["fixture"]["id"]],
      };

      count++;
      response_to_send.push(match_data);
    }
  }

  return res.status(200).send(response_to_send);
};

async function bet_limit(INVITATION_CODE) {
  // 1 = valid
  // 2 = invitation not found
  // 3 = invalid;
  // 4 = something went wrong

  if (!INVITATION_CODE || INVITATION_CODE == undefined) {
    return 2;
  }

  let today = new Date();
  let parsed_date = `${today.getDate()}/${
    today.getMonth() + 1
  }/${today.getFullYear()}`;

  let count = await Bet.find({
    inv: INVITATION_CODE,
    settled: false,
    date: parsed_date,
  }).count();
  if (count < 2 && count >= 0) {
    return 1;
  } else {
    return 3;
  }
  return 4;
}

module.exports.place_bet = async function place_bet(req, res) {
  const USER_ID = req.session.user_id;
  const INVITATION_CODE = req.session.inv;

  let day_bet_limit = await bet_limit(INVITATION_CODE);
  switch (day_bet_limit) {
    case 2:
      return res.send({ status: "invitation code error" });
    case 3:
      return res.send({ status: "today bet limit reached" });
    case 4:
      return res.send({ status: "something went wrong" });
  }

  let bet_exist = await Bet.findOne({
    inv: INVITATION_CODE,
    leagueId: req.body.league_id,
  });

  let time_left = await check_date(req.body.date, req.body.time);

  if ((time_left && !bet_exist) || bet_exist == "undefined") {
    let user_found = await User.findOne({ inv: INVITATION_CODE });
    let user_balance = parseFloat(user_found["Ammount"]);

    let data = {
      phone: user_found["phone"],
      inv: INVITATION_CODE,
      parent: user_found["parent"],
      bAmmount: parseFloat(req.body.ammount),
      leagueId: parseInt(req.body.league_id),
      league: req.body.league,
      team_a: req.body.team_a,
      team_b: req.body.team_b,
      scoreDetails: [
        {
          first: req.body.first,
          second: req.body.second,
        },
      ],
      final_score: [
        {
          first: -1,
          second: -1,
        },
      ],
      date: req.body.date,
      time: req.body.time,
      profit: req.body.profit,
      league_type: req.body.l_type,
    };

    let bet_amount = parseFloat(req.body.ammount);
    let deduct_amount = bet_amount - bet_amount * 2;

    if (user_balance >= data["bAmmount"]) {
      if (parseFloat(data["bAmmount"]) >= 1000) {
        if (await newBet(data)) {
          await User.findOneAndUpdate(
            { inv: INVITATION_CODE },
            { $inc: { betPlayed: 1, Ammount: deduct_amount } }
          );

          let body = `
                inv    : ${INVITATION_CODE} \n
                amount : ${bet_amount} \n
                leagueID : ${data["leagueId"]}
                score  : ${data["scoreDetails"][0]["first"]}-${data["scoreDetails"][0]["second"]} \n
                `;
          if (data["league"]) SENDMAIL(data["league"], body);

          return res.send({ status: 1 });
        } else {
          return res.send({ status: 0 });
        }
      } else {
        return res.send({ status: 5 });
      }
    } else {
      return res.send({ status: 4 });
    }
  } else {
    if (bet_exist) {
      return res.send({ status: 2 });
    } else if (!time_left) {
      return res.send({ status: 3 });
    } else {
      return res.send({ status: 0 });
    }
  }
};

async function check_date(date, time) {
  const nDate = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Calcutta",
  });
  // console.log(nDate + " asia tyme here");
  let today = new Date(nDate);
  let match_date = date.split(/\//);
  let m_time = time.split(/\:/);

  let m_date = parseInt(match_date[0]);
  let m_month = parseInt(match_date[1]);
  let m_hours = parseInt(m_time[0]);
  let m_minutes = parseInt(m_time[1]);

  let minutes_now = parseInt(today.getMinutes());
  let hours_now = parseInt(today.getHours());

  // console.log(minutes_now, 'without');
  minutes_now += 5;
  if (minutes_now >= 60) {
    minutes_now = minutes_now - 60;
    hours_now += 1;
  }

  let valid_date = parseInt(today.getDate()) === m_date;
  let valid_hour = hours_now < m_hours;
  let valid_minutes = minutes_now < m_minutes;
  let equal_hours = hours_now === m_hours;

  // console.log(m_date, today.getDate(), m_hours, hours_now, minutes_now, m_minutes);

  if (
    (valid_date && valid_hour) ||
    (valid_date && equal_hours && valid_minutes)
  ) {
    return true;
  }

  return false;
}

module.exports.withdrawalAmount = withdrawalAmount = async (req, res) => {
  let INVITATION_CODE = parseInt(req.session.inv);
  let USER_ID = req.session.user_id;
  let { withdrawal_code, amount } = req.body;

  const nDate = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Calcutta",
  });
  let today = new Date(nDate);
  let transactioin_id = crypto.randomBytes(16).toString("hex");
  transactioin_id = transactioin_id.slice(0, 6);

  let U_details = await User.findOne(
    { inv: INVITATION_CODE },
    { day_withdrawal: 1, BankDetails: 1, betPlayed: 1, Ammount: 1, vipLevel: 1 }
  );

  let unsettled_withdraws = await Withdrawal.findOne({
    inv: INVITATION_CODE,
    status: 0,
  }).count();

  let w_details = parseInt(U_details.BankDetails[0]["withdrawalC"]);
  let last_withdrawal = parseInt(U_details["day_withdrawal"]);
  let bets_played = parseInt(U_details["betPlayed"]);
  let valid_amount = parseFloat(U_details["valid_amount"]);
  let valid_deposit = parseFloat(U_details["valid_deposit"]);

  if (unsettled_withdraws > 0) {
    return res.send({ status: "You already have unsettled withdrawal's" });
  }

  if (w_details == 0 || withdrawal_code !== w_details) {
    return res.send({ status: "enter a VALID withdrawal code first" }); //enter withdrawal code first
  }

  if (
    U_details["BankDetails"] == "undefined" ||
    !U_details["BankDetails"].length ||
    !U_details["BankDetails"][0] ||
    !U_details["BankDetails"][0]["Name"]
  ) {
    return res.send({ status: "You dont have a bank account . " });
  }

  amount = parseFloat(amount);
  // check wethere user has the required balance or not
  if (amount > parseFloat(U_details["Ammount"])) {
    return res.send({ status: "YOU DONT HAVE ENOUGH BALANCE" });
  }

  if (valid_amount >= valid_deposit) {
    if (last_withdrawal !== today.getDate() || last_withdrawal == 0) {
      if (amount && transactioin_id && withdrawal_code) {
        let date = `${today.getDate()}/${
          today.getMonth() + 1
        }/${today.getFullYear()}`;
        let time = `${today.getHours()}:${today.getMinutes()}`;

        let data = {
          date: date,
          Ammount: amount,
          inv: INVITATION_CODE,
          transactioin_id: transactioin_id,
          time: time,
          status: 0,
        };

        console.log(data);

        if (await newWithdrawal(data)) {
          let deduct_amount = parseFloat(data["Ammount"] - 2 * data["Ammount"]);
          // deduct the amount from the user and increment the withdrawal amount and withdrawal count;
          await User.findOneAndUpdate(
            { inv: INVITATION_CODE },
            {
              $inc: {
                Ammount: deduct_amount,
                withdrawalAmmount: parseFloat(data["Ammount"]),
                Withdrawals: 1,
              },
              day_withdrawal: today.getDate(),
            }
          );

          let body = `
              INVITATION_CODE  : ${INVITATION_CODE} \n
              BANK ACCOUNT NO. : ${U_details["BankDetails"][0]["AcNumber"]} \n
              USER NAME        : ${U_details["BankDetails"][0]["Name"]} \n
              IFSC             : ${U_details["BankDetails"][0]["Ifsc"]} \n
              AMOUNT           : ${amount}\n
              AMOUNT - 10% : ${amount - parseFloat((amount / 10).toFixed(3))} \n
              TRANSACTION ID : ${data["transactioin_id"]}
              DATE : ${date} \n
            `;

          SENDMAIL("WITHDRAWAL", body);

          res.send({ status: 1 });
        } else {
          res.send({ status: 0 });
        }
      } else {
        return res.send({ status: "something went wrong with amount." }); // something went wrong with amount or the transaction id;
      }
    } else {
      return res.send({
        status: "you have reached you daily withdrawal limit.",
      }); //transaction id already exists;
    }
  } else {
    return res.send({ status: "valid amount not reached!!" });
  }
};

module.exports.add_bank_details = add_bank_details = async (req, res) => {
  let USER_ID = parseInt(req.session.inv);
  let the_user = await User.findOne({ inv: USER_ID });

  if (the_user["bankDetailsAdded"] === false) {
    let { name, ac_number, ifsc, T_pass } = req.body;
    if (!name || !ac_number || !ifsc || !T_pass) {
      return res.send({ status: 3 });
    } else {
      ac_number = ac_number;
      let updated = await User.findOneAndUpdate(
        { inv: USER_ID },
        {
          BankDetails: {
            Name: name,
            AcNumber: ac_number,
            Ifsc: ifsc,
            withdrawalC: T_pass,
          },
          bankDetailsAdded: true,
        }
      );

      if (updated) {
        return res.send({ status: 1 });
      } else {
        return res.send({ status: 0 });
      }
    }
  } else {
    return res.send({ status: 2 }); //details already exist;
  }
};

module.exports.usdt_withdraw = usdt_withdraw = async (req, res) => {
  let INVITATION_CODE = parseInt(req.session.inv);
  let USER_ID = req.session.user_id;
  let { amount, withdraw_password } = req.body;

  const nDate = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Calcutta",
  });
  let today = new Date(nDate);
  let transactioin_id = crypto.randomBytes(16).toString("hex");
  transactioin_id = transactioin_id.slice(0, 6);

  let U_details = await User.findOne(
    { inv: INVITATION_CODE },
    {
      day_withdrawal: 1,
      BankDetails: 1,
      usdt_address: 1,
      betPlayed: 1,
      Ammount: 1,
      vipLevel: 1,
      valid_amount: 1,
      valid_deposit: 1,
    }
  );

  let unsettled_withdraws = await Withdrawal.findOne({
    inv: INVITATION_CODE,
    status: 0,
  }).count();

  let w_details = parseInt(U_details.usdt_withdraw_code);
  let last_withdrawal = parseInt(U_details["day_withdrawal"]);
  let valid_amount = parseFloat(U_details["valid_amount"]);
  let valid_deposit = parseFloat(U_details["valid_deposit"]);
  let usdt_address = U_details.usdt_address;
  if (unsettled_withdraws > 0) {
    return res.send({ status: "You already have unsettled withdrawal's" });
  }

  if (w_details == 0 || withdraw_password !== w_details) {
    return res.send({ status: "enter a VALID withdrawal code first" }); //enter withdrawal code first
  }

  if (
    !U_details.usdt_address ||
    typeof U_details.usdt_address === "undefined"
  ) {
    return res.send({ status: "You dont have a bank account . " });
  }

  amount = parseFloat(amount);
  // check wethere user has the required balance or not
  if (amount > parseFloat(U_details["Ammount"])) {
    return res.send({ status: "YOU DONT HAVE ENOUGH BALANCE" });
  }

  if (valid_amount >= valid_deposit) {
    if (last_withdrawal !== today.getDate() || last_withdrawal == 0) {
      if (amount && transactioin_id && withdraw_password) {
        let date = `${today.getDate()}/${
          today.getMonth() + 1
        }/${today.getFullYear()}`;
        let time = `${today.getHours()}:${today.getMinutes()}`;

        let data = {
          date: date,
          Ammount: amount,
          inv: INVITATION_CODE,
          transactioin_id: transactioin_id,
          time: time,
          status: 0,
        };

        if (await newWithdrawal(data)) {
          let deduct_amount = parseFloat(data["Ammount"] - 2 * data["Ammount"]);
          // deduct the amount from the user and increment the withdrawal amount and withdrawal count;
          await User.findOneAndUpdate(
            { inv: INVITATION_CODE },
            {
              $inc: {
                Ammount: deduct_amount,
                withdrawalAmmount: parseFloat(data["Ammount"]),
                Withdrawals: 1,
              },
              day_withdrawal: today.getDate(),
            }
          );

          let body = `
              INVITATION_CODE  : ${INVITATION_CODE} \n
              USDT ADRESS : ${usdt_address}
              AMOUNT           : ${amount}\n
              AMOUNT - 10% : ${amount - parseFloat((amount / 10).toFixed(3))} \n
              TRANSACTION ID : ${data["transactioin_id"]}
              DATE : ${date} \n
            `;

          SENDMAIL("WITHDRAWAL", body);

          res.send({ status: 1 });
        } else {
          res.send({ status: 0 });
        }
      } else {
        return res.send({ status: "something went wrong with amount." }); // something went wrong with amount or the transaction id;
      }
    } else {
      return res.send({
        status: "you have reached you daily withdrawal limit.",
      }); //transaction id already exists;
    }
  } else {
    return res.send({ status: "valid amount not reached!!" });
  }
};

module.exports.usdt_deposit = usdt_deposit = async (req, res) => {
  let { amount, transaction_id } = req.body;
  let INVITATION_CODE = parseInt(req.session.inv);
  let trans_id_exist = await Deposit.findOne({
    transactioin_id: transaction_id,
  });

  if (!trans_id_exist) {
    if (amount && transaction_id) {
      amount = parseFloat(amount);
      const nDate = new Date().toLocaleString("en-US", {
        timeZone: "Asia/Calcutta",
      });
      let today = new Date(nDate);
      let time = `${today.getHours()}:${today.getMinutes()}`;
      let date = `${today.getDate()}/${
        today.getMonth() + 1
      }/${today.getFullYear()}`;

      let data = {
        date: date,
        time: time,
        Ammount: amount,
        inv: INVITATION_CODE,
        transactioin_id: transaction_id,
        status: 0,
      };

      if (await newDeposit(data)) {
        let body = `
        USDT
          DATE : ${date} \n
          TIME : ${time} \n
          INVITATION_CODE : ${data.inv} \n
          AMOUNT :  ${data.Ammount} \n
          TRANSACTION_ID : ${data.transactioin_id}
          `;
        SENDMAIL("DEPOSIT", body);

        res.send({ status: 1 });
      } else {
        res.send({ status: "something went wrong" });
      }
    } else {
      return res.send({ status: "something went wrong" }); // something went wrong with amount or the transaction id;
    }
  } else {
    return res.send({ status: "transaction id already exist." });
  }
};

module.exports.sv_usdt_details = sv_usdt_details = async (req, res) => {
  let INVITATION_CODE = parseInt(req.session.inv);
  let { usdt_d_adress, usdt_d_password } = req.body;
  if (
    !usdt_d_adress ||
    typeof usdt_d_adress === "undefined" ||
    !usdt_d_adress ||
    typeof usdt_d_adress === "undefined"
  ) {
    return res.send({ status: "invalid details" });
  } else {
    try {
      await User.findOneAndUpdate(
        { inv: INVITATION_CODE },
        {
          usdt_address: usdt_d_adress,
          usdt_withdraw_code: usdt_d_password,
        }
      );
      return res.send({ status: 1 });
    } catch (error) {
      return res.send({ status: "someting went wrong" });
    }
  }
};

// this function saves the new bet user has placed;
async function newBet(data) {
  let res = await Bet.create(data);
  let what_happened = !res ? false : true;
  return what_happened;
}

// when a user initiates a new withdrawal this will save teh data to the database
async function newWithdrawal(data) {
  let res = await Withdrawal.create(data);
  let what_happened = !res ? false : true;
  return what_happened;
}
async function newDeposit(data) {
  let res = await Deposit.create(data);
  let what_happened = !res ? false : true;
  return what_happened;
}
// mail sender
async function SENDMAIL(subject, body) {
  let to = "";

  switch (subject) {
    case "WITHDRAWAL":
      to = "allinonegold2586@gmail.com";
      break;
    case "DEPOSIT":
      to = "jyotikumari63421@gmail.com";
      break;
    case "BET DELETE":
      to = "simrankumari6343@gmail.com";
      break;
    case "VIRTUAL":
      to = "manojkumar757320@gmail.com";
      break;
    default:
      to = "amitram070651@gmail.com";
  }
  // console.log(to , subject);
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "vishwakarma9304411522@gmail.com",
      pass: "vigtmiugmomefooi",
    },
  });

  let mailOptions = {
    from: "vishwakarma9304411522@gmail.com",
    to: to,
    subject: subject,
    text: body,
  };

  transporter.sendMail(mailOptions, async (err, info) => {
    if (err) {
      console.log(err);
    }
  });
}

// qavr typr qziv ruhp
