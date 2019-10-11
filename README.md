# Coin Market Scanner Bot

### Coin Market Scanner Bot, or CMS Bot, is a command line cryptocurrency trading bot using  NodeJS. 

It currently works on Binance's BTC pairs only. 

## Disclaimer
CMS Bot is in Alpha version and it has bugs. Use this only if you understand the code and what it does. 

Running a bot, and trading in general requires careful study of the risks and parameters involved. A wrong setting can cause you a major loss.

__USE IT AT YOUR OWN RISK.__

## Donate
I'll take donations in BTC only at:

<form method="POST" action="https://btcpay01.sparkpay.pt/api/v1/invoices" >
    <input type="hidden" name="storeId" value="Shnkny3J4SuH5ThRZjSZPEKB4DCt6Q97nrShhtStpgb" />
    <div style="text-align:center;display:inline;width:209px"><input type="text" id="btcpay-input-price" name="price"  min="0" max="none" step="any"  value="5" style="border: none; background-image: none; background-color: transparent; -webkit-box-shadow: none ; -moz-box-shadow: none ; -webkit-appearance: none ; width: 209px; text-align: center; font-size: 25px; margin: auto; border-radius: 5px; line-height: 35px; background: #fff;" oninput="event.preventDefault();isNaN(event.target.value) || event.target.value <= 0 ? document.querySelector('#btcpay-input-price').value = 5 : event.target.value" onchange="document.querySelector('#btcpay-input-range').value = document.querySelector('#btcpay-input-price').value" /><select  onmouseover="this.style.border='solid #ccc 1px'; this.style.padding='0px'"  onmouseout="this.style.border='0'; this.style.padding='1px'" onchange="document.querySelector('input[type = hidden][name = currency]').value = event.target.value" style="border: 0; display: block; padding: 1px; margin: auto auto 5px auto; font-size: 11px; background: 0 0; cursor: pointer;"><option value="USD">USD</option><option value="GBP">GBP</option><option value="EUR">EUR</option><option value="BTC">BTC</option></select><input class="btcpay-input-range" id="btcpay-input-range" value="5" type="range" min="1" max="100" step="1" style="width:209px ;margin-bottom:15px;" oninput="document.querySelector('#btcpay-input-price').value = document.querySelector('#btcpay-input-range').value" />
    <style type="text/css">input[type=range].btcpay-input-range{-webkit-appearance:none;width:100%;margin:9.45px 0}input[type=range].btcpay-input-range:focus{outline:0}input[type=range].btcpay-input-range::-webkit-slider-runnable-track{width:100%;height:3.1px;cursor:pointer;box-shadow:0 0 1.7px #020,0 0 0 #003c00;background:#f3f3f3;border-radius:1px;border:0 solid rgba(24,213,1,0)}input[type=range].btcpay-input-range::-webkit-slider-thumb{box-shadow:0 0 3.7px rgba(0,170,0,0),0 0 0 rgba(0,195,0,0);border:2.5px solid #cedc21;height:22px;width:23px;border-radius:12px;background:#0f3723;cursor:pointer;-webkit-appearance:none;margin-top:-9.45px}input[type=range].btcpay-input-range:focus::-webkit-slider-runnable-track{background:#fff}input[type=range].btcpay-input-range::-moz-range-track{width:100%;height:3.1px;cursor:pointer;box-shadow:0 0 1.7px #020,0 0 0 #003c00;background:#f3f3f3;border-radius:1px;border:0 solid rgba(24,213,1,0)}input[type=range].btcpay-input-range::-moz-range-thumb{box-shadow:0 0 3.7px rgba(0,170,0,0),0 0 0 rgba(0,195,0,0);border:2.5px solid #cedc21;height:22px;width:23px;border-radius:12px;background:#0f3723;cursor:pointer}input[type=range].btcpay-input-range::-ms-track{width:100%;height:3.1px;cursor:pointer;background:0 0;border-color:transparent;color:transparent}input[type=range].btcpay-input-range::-ms-fill-lower{background:#e6e6e6;border:0 solid rgba(24,213,1,0);border-radius:2px;box-shadow:0 0 1.7px #020,0 0 0 #003c00}input[type=range].btcpay-input-range::-ms-fill-upper{background:#f3f3f3;border:0 solid rgba(24,213,1,0);border-radius:2px;box-shadow:0 0 1.7px #020,0 0 0 #003c00}input[type=range].btcpay-input-range::-ms-thumb{box-shadow:0 0 3.7px rgba(0,170,0,0),0 0 0 rgba(0,195,0,0);border:2.5px solid #cedc21;height:22px;width:23px;border-radius:12px;background:#0f3723;cursor:pointer;height:3.1px}input[type=range].btcpay-input-range:focus::-ms-fill-lower{background:#f3f3f3}input[type=range].btcpay-input-range:focus::-ms-fill-upper{background:#fff}</style></div>
    <input type="hidden" name="currency" value="USD" />
    <input type="hidden" name="orderId" value="Donation CMSBot" />
    <input type="image" src="https://btcpay01.sparkpay.pt/img/paybutton/pay.png" name="submit" style="width:209px" alt="Pay with BtcPay, Self-Hosted Bitcoin Payment Processor">
</form>

