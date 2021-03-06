// 高速フーリエ変換
class DFT {

    static swap(v, a, b) {
        let ar = v[a + 0];
        let ai = v[a + 1];
        v[a + 0] = v[b + 0];
        v[a + 1] = v[b + 1];
        v[b + 0] = ar;
        v[b + 1] = ai;
    }

    static swapElements(n, v) {
        let n2 = n + 2;
        let nh = n >>> 1;

        for (let i = 0, j = 0; i < n; i += 4) {
            DFT.swap(v, i + n, j + 2);
            if (i < j) {
                DFT.swap(v, i + n2, j + n2);
                DFT.swap(v, i, j);
            }

            for (let k = nh; (j ^= k) < k; k >>= 1) {
            }
        }
    }

    static scaleElements(n, v, s, off = 0) {
        for (let i = 0; i < n; ++i) {
            v[off + i] /= s;
        }
    }

    static fft(n, v, inv = false) {
        let rad = (inv ? 2.0 : -2.0) * Math.PI / n;
        let nd = n << 1;

        for (let m = nd, mh; 2 <= (mh = m >>> 1); m = mh) {
            for (let i = 0; i < mh; i += 2) {
                let rd = rad * (i >> 1);
                let cs = Math.cos(rd), sn = Math.sin(rd);

                for (let j = i; j < nd; j += m) {
                    let k = j + mh;
                    let ar = v[j + 0], ai = v[j + 1];
                    let br = v[k + 0], bi = v[k + 1];

                    v[j + 0] = ar + br;
                    v[j + 1] = ai + bi;

                    let xr = ar - br;
                    let xi = ai - bi;
                    v[k + 0] = xr * cs - xi * sn;
                    v[k + 1] = xr * sn + xi * cs;
                }
            }
            rad *= 2;
        }

        DFT.swapElements(n, v);

        if (inv) {
            DFT.scaleElements(nd, v, n);
        }
    }
}

const start = document.querySelector('#start');
const stop = document.querySelector('#stop');
const canvas = document.querySelector('#canvas');
const drawContext = canvas.getContext('2d');
const cw = canvas.width;
const ch = canvas.height;

navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {

    const audioContext = new AudioContext();
    const sourceNode = audioContext.createMediaStreamSource(stream);
    const analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    sourceNode.connect(analyserNode);

    let freq = 1024;

    function tuning() {
        const array = new Float32Array(analyserNode.fftSize / 2);
        analyserNode.getFloatTimeDomainData(array);

        // 窓関数を掛ける
        for(var num = 0; num < array.length; num++){
            if(10 * array[num] < -0.5 + 0.54 - 0.46 * Math.cos(2 * Math.PI * num / array.length)) array[num] = 0;
        }

        // フーリエ変換の処理を施すため、実数、虚数の順で並んだ配列を作る
        let data = [];
        for(var num = 0; num < array.length; ++num){
            data.push(array[num]);
            data.push(0);
        }

        // フーリエ変換
        DFT.fft(data.length / 2, data);

        // 実数、虚数の順で並んでいる変換後の配列からパワースペクトル配列を作る
        let powerSpectle = [];
        for(var num = 0; num < data.length; num += 2) powerSpectle.push( Math.sqrt(data[num] * data[num] + data[num+1] * data[num+1]) );

        // 弱い周波数成分を除去することでノイズ抑制
        for(var num = 0; num < powerSpectle.length; num++){
            if(powerSpectle[num] <= 4) powerSpectle[num] = 0;
        }

        // フーリエ逆変換の処理のため実数、虚数の順で並んだ配列を作る
        let autocorrelation = [];
        for(var num = 0; num < powerSpectle.length; ++num){
            autocorrelation.push(powerSpectle[num]);
            autocorrelation.push(0);
        }
        
        // フーリエ逆変換、これが自己相関関数
        DFT.fft(autocorrelation.length / 2, autocorrelation, true);

        // 逆変換後の配列は実数、虚数の順で並んでいるので、実数部分のみを取り出す
        let autocorrelationReal = [];
        for(var num = 0; num < autocorrelation.length; num += 2) autocorrelationReal.push(autocorrelation[num]);
        
        // 自己相関関数を正規化したNSDFの配列を作る
        let NSDF = new Float32Array(autocorrelationReal.length);
        for(num = 0; num < autocorrelationReal.length; num++){
            if( autocorrelationReal[0] ){
                NSDF[num] = autocorrelationReal[num] / autocorrelationReal[0];
            }else NSDF[num] = 0;
        }

        // ピーク検出のため、最初の0クロス点を探す
        let negativeCross = 0;
        for(var num = 0; num < NSDF.length; num++){
            if(NSDF[num] <= 0){
                negativeCross = num;
                break;
            }
        }
        // 正規化した自己相関関数の最大値を探す
        let NSDFmax = 0;
        let tMax = 0;
        for(var num = negativeCross; num < NSDF.length / 2; num++){
            if(NSDF[num] > NSDFmax) tMax = num;
            NSDFmax = Math.max(NSDFmax, NSDF[num]);
        }

        // 隣り合う配列要素との差を取り、さらにその積を取る
        // 積が負の点が、ピーク点
        let d = [];
        let dd = [];
        for(var num = 1; num < NSDF.length; num++){
            d.push(NSDF[num] - NSDF[num - 1]);
        }
        for(var num = 0; num < NSDF.length - 1; num++){
            dd.push(d[num] * d[num + 1]);
        }

        // ピーク点の中で、正規化した自己相関関数の最大値の8割以上の大きさのものをピーク配列に格納
        // ピーク配列のうち、最初のものが入力信号の周期に相当
        let T = 0;
        let peak = [];
        for(var num = negativeCross; num < dd.length; num++){
            if(dd[num] <= 0 && NSDF[num] >= NSDFmax * 0.8){
                peak.push(num);
            }
        }
        T = peak[0];

        // サンプリング周波数を周期で割って周波数すなわちピッチを算出
        // 倍音の検出を防ぐため、表示するピッチは検出したピッチのうち最小のものを採用(※1)
        if(T != 0){
            freq = Math.min(freq, 44100 / T);
            //console.log(freq);
            freq = Math.floor(freq * 1000) / 1000; // 小数点以下第3位までで切り捨て
            const freqArea = document.getElementById('freqArea');
            freqArea.innerHTML = "Pitch is ... ";
            freqArea.innerHTML += freq;
            freqArea.innerHTML += "[Hz]";
        }

        // NSDFをグラフに描画していく
        const barWidth = cw / NSDF.length;
        drawContext.fillStyle = 'rgba(0, 0, 0, 1)';
        drawContext.fillRect(0, 0, cw, ch);

        // 横軸の描画
        drawContext.fillStyle = 'blue';
        drawContext.fillRect(0, ch/2, cw, 2);
        // for(var num = 50; num < NSDF.length; num += 50){
        //     drawContext.fillRect(num * barWidth, 0, 0.7, ch);
        // }

        for (num = 0; num < NSDF.length; ++num) {
            const value = NSDF[num];
            const percent = ( value + 1 ) / 2;
            const height = ch * percent;
            const offset = ch - height;
  
            drawContext.fillStyle = 'lime';
            drawContext.fillRect(num * barWidth, offset, barWidth, 2);
        }
  
        // 継続的にピッチ検出と描画を行う
        // stopボタンが押されるまで処理を継続する
        if(stop.disabled == false){
            requestAnimationFrame(tuning);
        }
    }

    start.onclick = function() {
        start.disabled = true;
        stop.disabled = false;
        tuning();
    }
    stop.onclick = function() {
        start.disabled = false;
        stop.disabled = true;
    }

    // (※1)のコードのため、定期的に周波数をリセットしないと継続的にピッチ検出機能を使えない
    setInterval(function() {
        freq = 1024;
    }, 2000);

}).catch(error => {
    console.log(error);
});