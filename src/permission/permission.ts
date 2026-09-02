/** permissions.request() は拡張機能のページからしか呼べないので、この小窓で受ける。 */
import { localizeDocument } from '../shared/localize';
import { hasTabCapture, requestTabCapture } from '../shared/permissions';

localizeDocument();

const grantButton = document.getElementById('grant') as HTMLButtonElement | null;

grantButton?.addEventListener('click', () => {
  grantButton.disabled = true;
  // 許可でも拒否でも、Chrome の確認が終わればこの窓の役目は終わり
  void requestTabCapture().finally(() => window.close());
});

// 別の経路で既に許可されていれば用は無い
void hasTabCapture().then((granted) => {
  if (granted) window.close();
});
